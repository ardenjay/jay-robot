#!/usr/bin/env python3
"""
netparse.py — Cadence Allegro PST netlist 解析與查詢工具
=========================================================
吃同一批匯出的三個檔:
    pstxprt.dat  (EXPANDEDPARTLIST)  refdes -> 零件定義名稱
    pstchip.dat  (LIBRARY_PARTS)     零件定義 -> 腳數 / 料號 / 封裝 / 料值
    pstxnet.dat  (EXPANDEDNETLIST)   net -> [(refdes, pin) ...]

換產品時只要把三個檔換掉、目錄指對即可,程式不用改。

用法範例:
    python3 netparse.py --dir .  info
    python3 netparse.py --dir .  find RTL8126
    python3 netparse.py --dir .  part U42
    python3 netparse.py --dir .  net VDD_3V3_RTL
    python3 netparse.py --dir .  connector CN3
    python3 netparse.py --dir .  trace U42.4            # 從某支腳追訊號路徑(會穿過串聯 R/L/FB)
    python3 netparse.py --dir .  trace U42.4 --hop-cap  # 連 AC 耦合電容也穿過
    python3 netparse.py --dir .  export out.json        # 匯出所有查表結構成 JSON
"""

import argparse, json, os, re, sys, collections

# 被動「串聯穿越」元件:訊號從一腳進、另一腳出。預設 R/L/FB 視為可穿越。
PASS_THROUGH_PREFIX = ('R', 'L', 'FB')
# 端點元件(追線到此停下):IC、連接器、晶振、開關、二極體、電晶體
ENDPOINT_PREFIX = ('U', 'CN', 'J', 'Y', 'SW', 'D', 'Q', 'LED', 'HM')


def prefix(refdes):
    m = re.match(r'[A-Z]+', refdes)
    return m.group() if m else ''


class Netlist:
    def __init__(self, dir_):
        self.dir = dir_
        self.refdes_to_prim = {}     # 'U42' -> 'RTL8126-VB-CG_0'
        self.prim_info = {}          # primitive -> {part, jedec, value, pins}
        self.net_to_nodes = collections.OrderedDict()  # net -> [(refdes,pin)]
        self.pin_to_net = {}         # (refdes,pin) -> net
        self.pin_label = {}          # (refdes,pin) -> 腳位標籤(訊號名,可能為腳號)
        self.label_to_nodes = collections.defaultdict(list)  # 標籤(大寫) -> [(refdes,pin,net)]
        self.root = None
        self._load()

    def _read(self, name):
        path = os.path.join(self.dir, name)
        if not os.path.exists(path):
            sys.exit(f"找不到檔案: {path}")
        with open(path, encoding='utf-8', errors='replace') as f:
            return f.read()

    def _load(self):
        # ---- pstxprt.dat : refdes -> primitive ----
        prt = self._read('pstxprt.dat')
        rootm = re.search(r"ROOT_DRAWING='([^']+)'", prt)
        self.root = rootm.group(1) if rootm else '(unknown)'
        for m in re.finditer(r"PART_NAME\s*\n\s*(\S+)\s+'([^']+)'", prt):
            self.refdes_to_prim[m.group(1)] = m.group(2)

        # ---- pstchip.dat : primitive -> body ----
        chip = self._read('pstchip.dat')
        for blk in re.split(r'\nprimitive ', chip):
            nm = re.match(r"'([^']+)'", blk)
            if not nm:
                continue
            name = nm.group(1)
            def g(pat):
                mm = re.search(pat, blk)
                return mm.group(1) if mm else ''
            self.prim_info[name] = dict(
                part=g(r"PART_NAME='([^']*)'"),
                jedec=g(r"JEDEC_TYPE='([^']*)'"),
                value=g(r"VALUE='([^']*)'"),
                pins=len(re.findall(r"PIN_NUMBER=", blk)),
            )

        # ---- pstxnet.dat : net -> nodes ----
        lines = self._read('pstxnet.dat').splitlines()
        cur = None
        i = 0
        while i < len(lines):
            ln = lines[i]
            if ln.startswith('NET_NAME'):
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                nm = re.match(r"\s*'([^']+)'", lines[j]) if j < len(lines) else None
                cur = nm.group(1) if nm else None
                if cur is not None:
                    self.net_to_nodes.setdefault(cur, [])
                i = j + 1
                continue
            m = re.match(r"NODE_NAME\t(\S+)\s+(.+)", ln)
            if m and cur is not None:
                refdes, pin = m.group(1), m.group(2).strip()
                self.net_to_nodes[cur].append((refdes, pin))
                self.pin_to_net[(refdes, pin)] = cur
                # 腳位標籤在 NODE_NAME 下面第二行,形如  'CSI0_CLK_P':;
                label = None
                for k in (i + 1, i + 2):
                    if k < len(lines):
                        lm = re.match(r"\s*'([^']+)':;?\s*$", lines[k])
                        if lm and not lines[k].lstrip().startswith("'@"):
                            label = lm.group(1)
                if label:
                    self.pin_label[(refdes, pin)] = label
                    self.label_to_nodes[label.upper()].append((refdes, pin, cur))
            i += 1

    # ---------- 查詢輔助 ----------
    def part_label(self, refdes):
        prim = self.refdes_to_prim.get(refdes, '')
        info = self.prim_info.get(prim, {})
        part = info.get('part') or prim
        val = info.get('value', '')
        return f"{part}{(' '+val) if val else ''}"

    def pins_of(self, refdes):
        return sorted([pn for (rd, pn), net in self.pin_to_net.items() if rd == refdes],
                      key=lambda x: (len(x), x))

    def _fuzzy_nets(self, query, limit=8):
        """找相近的 net 名:忽略大小寫與底線差異,再做子字串比對。"""
        def norm(s):
            return s.upper().replace('_', '')
        q = norm(query)
        exact_ci = [n for n in self.net_to_nodes if n.upper() == query.upper()]
        if exact_ci:
            return exact_ci, True
        norm_match = [n for n in self.net_to_nodes if norm(n) == q]
        if norm_match:
            return norm_match, True
        sub = [n for n in self.net_to_nodes if q in norm(n)]
        return sorted(sub, key=len)[:limit], False

    # ---------- 結構化查詢 (供 --json / 工具呼叫) ----------
    def q_info(self):
        pref = collections.Counter(prefix(rd) for rd in self.refdes_to_prim)
        return dict(
            root=self.root,
            nets=len(self.net_to_nodes),
            parts=len(self.refdes_to_prim),
            nodes=sum(len(v) for v in self.net_to_nodes.values()),
            defs=len(self.prim_info),
            prefixes=dict(pref.most_common()),
        )

    def q_find(self, keyword):
        kw = keyword.upper()
        hits = []
        for rd, prim in self.refdes_to_prim.items():
            info = self.prim_info.get(prim, {})
            if kw in (prim + ' ' + info.get('part', '')).upper():
                hits.append(dict(refdes=rd, part=info.get('part', prim),
                                 pins=info.get('pins'), prim=prim))
        hits.sort(key=lambda h: h['refdes'])
        return dict(keyword=keyword, count=len(hits), hits=hits)

    def q_part(self, refdes):
        if refdes not in self.refdes_to_prim:
            return dict(refdes=refdes, found=False, error=f"查無此 refdes: {refdes}")
        prim = self.refdes_to_prim[refdes]
        pins = [dict(pin=pn, net=self.pin_to_net.get((refdes, pn)))
                for pn in self.pins_of(refdes)]
        return dict(refdes=refdes, found=True, part=self.part_label(refdes),
                    prim=prim, pin_count=len(pins), pins=pins)

    def q_net(self, netname):
        resolved, suggestions = None, []
        if netname in self.net_to_nodes:
            resolved = netname
        else:
            matches, exact = self._fuzzy_nets(netname)
            if not matches:
                lab = self.label_to_nodes.get(netname.upper())
                if lab:
                    seen = []
                    for _rd, _pn, net in lab:
                        if net not in seen:
                            seen.append(net)
                    return dict(query=netname, found=False, is_label=True, label_nets=seen)
                return dict(query=netname, found=False, error=f"查無此 net: {netname}")
            if exact and len(matches) == 1:
                resolved = matches[0]
            elif exact:
                resolved = matches[0]
                suggestions = [dict(net=n, nodes=len(self.net_to_nodes[n])) for n in matches]
            else:
                return dict(query=netname, found=False,
                            suggestions=[dict(net=n, nodes=len(self.net_to_nodes[n])) for n in matches])
        nodes = [dict(refdes=rd, pin=pn, part=self.part_label(rd),
                      label=self.pin_label.get((rd, pn)))
                 for rd, pn in self.net_to_nodes[resolved]]
        return dict(query=netname, found=True, net=resolved,
                    node_count=len(nodes), nodes=nodes, suggestions=suggestions)

    def q_pin(self, label):
        hits = self.label_to_nodes.get(label.upper())
        if not hits:
            cand = sorted({l for l in self.label_to_nodes if label.upper() in l}, key=len)[:12]
            return dict(label=label, found=False, suggestions=cand)
        return dict(label=label, found=True,
                    hits=[dict(refdes=rd, pin=pn, part=self.part_label(rd), net=net)
                          for rd, pn, net in hits])

    def q_trace(self, start, hop_cap=False):
        if '.' not in start:
            return dict(start=start, found=False, error="格式應為 refdes.pin,例如 U42.4")
        rd0, pn0 = start.split('.', 1)
        if (rd0, pn0) not in self.pin_to_net:
            return dict(start=start, found=False, error=f"查無此腳: {start}")
        pass_pref = list(PASS_THROUGH_PREFIX) + (['C'] if hop_cap else [])
        visited_nets, endpoints = set(), []
        queue = [(rd0, pn0, [dict(refdes=rd0, pin=pn0, part=self.part_label(rd0))])]
        while queue:
            rd, pn, path = queue.pop(0)
            net = self.pin_to_net.get((rd, pn))
            if net is None or net in visited_nets:
                continue
            visited_nets.add(net)
            for (rd2, pn2) in self.net_to_nodes.get(net, []):
                if rd2 == rd and pn2 == pn:
                    continue
                step = path + [dict(refdes=rd2, pin=pn2, part=self.part_label(rd2), via_net=net)]
                if prefix(rd2) in pass_pref:
                    other = [p for p in self.pins_of(rd2) if p != pn2]
                    if len(other) == 1:
                        queue.append((rd2, other[0], step))
                    else:
                        endpoints.append(step)
                else:
                    endpoints.append(step)
        return dict(start=start, found=True, pass_through=pass_pref,
                    path_count=len(endpoints), paths=endpoints)

    # ---------- 指令 ----------
    def cmd_info(self):
        print(f"ROOT_DRAWING : {self.root}")
        print(f"nets         : {len(self.net_to_nodes)}")
        print(f"零件實體     : {len(self.refdes_to_prim)}")
        print(f"節點總數     : {sum(len(v) for v in self.net_to_nodes.values())}")
        print(f"零件定義     : {len(self.prim_info)}")
        # 前綴統計
        pref = collections.Counter(prefix(rd) for rd in self.refdes_to_prim)
        print("前綴分布     : " + ", ".join(f"{p}={c}" for p, c in pref.most_common()))

    def cmd_find(self, keyword):
        kw = keyword.upper()
        hits = []
        for rd, prim in self.refdes_to_prim.items():
            info = self.prim_info.get(prim, {})
            hay = (prim + ' ' + info.get('part', '')).upper()
            if kw in hay:
                hits.append((rd, info.get('part', prim), info.get('pins', '?'), prim))
        if not hits:
            print(f"找不到含 '{keyword}' 的零件")
            return
        for rd, part, pins, prim in sorted(hits):
            print(f"  {rd:6} {part:30} pins={pins:>4}  [{prim}]")

    def cmd_part(self, refdes):
        if refdes not in self.refdes_to_prim:
            print(f"查無此 refdes: {refdes}")
            return
        print(f"{refdes} = {self.part_label(refdes)}")
        prim = self.refdes_to_prim[refdes]
        print(f"  定義: {prim}")
        print("  腳位 -> net:")
        for pn in self.pins_of(refdes):
            net = self.pin_to_net.get((refdes, pn), '?')
            print(f"    {pn:>6}  {net}")

    def cmd_net(self, netname):
        if netname not in self.net_to_nodes:
            matches, exact = self._fuzzy_nets(netname)
            if not matches:
                # 也許使用者打的是「腳位標籤」而非 net 名
                lab = self.label_to_nodes.get(netname.upper())
                if lab:
                    print(f"'{netname}' 不是 net 名,而是腳位標籤。它實際所在的 net:")
                    seen = set()
                    for rd, pn, net in lab:
                        if net not in seen:
                            seen.add(net)
                            print(f"  -> {net}   (在 {rd}.{pn})")
                    print(f"\n用正確 net 名再查一次,例如: net {next(iter(seen))}")
                    return
                print(f"查無此 net: {netname}")
                return
            if exact and len(matches) == 1:
                netname = matches[0]
            else:
                print(f"找不到精確的 '{netname}',你是不是要找:")
                for n in matches:
                    print(f"  - {n}  ({len(self.net_to_nodes[n])} 節點)")
                if exact:
                    netname = matches[0]
                    print(f"\n顯示最接近的: {netname}\n")
                else:
                    return
        nodes = self.net_to_nodes[netname]
        print(f"NET {netname}  ({len(nodes)} 個節點)")
        for rd, pn in nodes:
            lbl = self.pin_label.get((rd, pn), '')
            lbl = f"  腳名={lbl}" if lbl and lbl != pn else ''
            print(f"    {rd}.{pn:<6} {self.part_label(rd)}{lbl}")

    def cmd_pin(self, label):
        """用腳位標籤(訊號名)反查:它在哪些零件腳上、屬於哪條 net。"""
        hits = self.label_to_nodes.get(label.upper())
        if not hits:
            # 模糊:子字串
            cand = sorted({l for l in self.label_to_nodes if label.upper() in l}, key=len)[:12]
            if cand:
                print(f"找不到腳位標籤 '{label}',相近的有:")
                for c in cand:
                    print(f"  - {c}")
            else:
                print(f"查無腳位標籤: {label}")
            return
        print(f"腳位標籤 '{label}' 出現在:")
        for rd, pn, net in hits:
            print(f"  {rd}.{pn:<6} {self.part_label(rd)}   --> net: {net}")

    def cmd_connector(self, refdes):
        self.cmd_part(refdes)

    def cmd_trace(self, start, hop_cap=False, max_depth=40):
        """從 refdes.pin 出發,沿 net 追到端點(IC/連接器),穿過串聯 R/L/FB(可選 C)。"""
        if '.' not in start:
            print("格式應為 refdes.pin,例如 U42.4")
            return
        rd0, pn0 = start.split('.', 1)
        if (rd0, pn0) not in self.pin_to_net:
            print(f"查無此腳: {start}")
            return
        pass_pref = list(PASS_THROUGH_PREFIX) + (['C'] if hop_cap else [])
        visited_nets = set()
        endpoints = []
        # 佇列元素: (refdes, pin_進, 路徑描述)
        start_net = self.pin_to_net[(rd0, pn0)]
        queue = [(rd0, pn0, [f"{rd0}.{pn0} ({self.part_label(rd0)})"])]
        print(f"從 {start} 出發追線 (穿越: {'/'.join(pass_pref)})\n")
        while queue:
            rd, pn, path = queue.pop(0)
            net = self.pin_to_net.get((rd, pn))
            if net is None or net in visited_nets:
                continue
            visited_nets.add(net)
            for (rd2, pn2) in self.net_to_nodes.get(net, []):
                if rd2 == rd and pn2 == pn:
                    continue
                pf = prefix(rd2)
                step = path + [f"--[{net}]--> {rd2}.{pn2} ({self.part_label(rd2)})"]
                if pf in pass_pref:
                    # 串聯元件:從另一腳穿出去繼續追
                    other = [p for p in self.pins_of(rd2) if p != pn2]
                    if len(other) == 1:
                        queue.append((rd2, other[0], step + [f"    (穿過 {rd2})"]))
                    else:
                        endpoints.append(step)
                else:
                    endpoints.append(step)
        if not endpoints:
            print("(此腳所在 net 沒有可達端點)")
        for i, ep in enumerate(endpoints, 1):
            print(f"路徑 {i}:")
            for s in ep:
                print("   " + s)
            print()

    def cmd_export(self, outpath):
        data = dict(
            root=self.root,
            refdes_to_prim=self.refdes_to_prim,
            prim_info=self.prim_info,
            net_to_nodes={k: v for k, v in self.net_to_nodes.items()},
        )
        with open(outpath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print(f"已匯出 -> {outpath}")


def main():
    ap = argparse.ArgumentParser(description="Allegro PST netlist 解析查詢工具")
    ap.add_argument('--dir', default='.', help='三個 .dat 檔所在目錄')
    # --json 共用旗標(放 parent,可出現在子命令之後): 結構化 JSON 輸出
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--json', action='store_true', help='輸出結構化 JSON')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('info', parents=[common])
    p = sub.add_parser('find',      parents=[common]); p.add_argument('keyword')
    p = sub.add_parser('part',      parents=[common]); p.add_argument('refdes')
    p = sub.add_parser('net',       parents=[common]); p.add_argument('netname')
    p = sub.add_parser('pin',       parents=[common]); p.add_argument('label')
    p = sub.add_parser('connector', parents=[common]); p.add_argument('refdes')
    p = sub.add_parser('trace',     parents=[common]); p.add_argument('pin'); p.add_argument('--hop-cap', action='store_true')
    p = sub.add_parser('export');   p.add_argument('outpath')
    args = ap.parse_args()

    nl = Netlist(args.dir)

    if getattr(args, 'json', False):
        result = None
        if args.cmd == 'info':         result = nl.q_info()
        elif args.cmd == 'find':       result = nl.q_find(args.keyword)
        elif args.cmd == 'part':       result = nl.q_part(args.refdes)
        elif args.cmd == 'net':        result = nl.q_net(args.netname)
        elif args.cmd == 'pin':        result = nl.q_pin(args.label)
        elif args.cmd == 'connector':  result = nl.q_part(args.refdes)
        elif args.cmd == 'trace':      result = nl.q_trace(args.pin, hop_cap=args.hop_cap)
        print(json.dumps(result, ensure_ascii=False, indent=1))
        return

    if args.cmd == 'info':       nl.cmd_info()
    elif args.cmd == 'find':     nl.cmd_find(args.keyword)
    elif args.cmd == 'part':     nl.cmd_part(args.refdes)
    elif args.cmd == 'net':      nl.cmd_net(args.netname)
    elif args.cmd == 'pin':      nl.cmd_pin(args.label)
    elif args.cmd == 'connector':nl.cmd_connector(args.refdes)
    elif args.cmd == 'trace':    nl.cmd_trace(args.pin, hop_cap=args.hop_cap)
    elif args.cmd == 'export':   nl.cmd_export(args.outpath)


if __name__ == '__main__':
    main()
