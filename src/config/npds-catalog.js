const NPDS_CATALOG = {
  C1: {
    name: 'C1 計畫 (Planning)',
    docs: [
      { code: 'C101', name: 'NDA 保密協議', desc: '與客戶簽署保密協議' },
      { code: 'C102', name: 'RFI/RFQ 詢報及應報', desc: '客戶詢報文件與報價回覆' },
      { code: 'C103', name: '客戶規格需求書（初稿）', desc: '客戶提供的初稿規格需求' },
      { code: 'C104', name: '合約 / PO 訂單', desc: '正式合約或採購訂單' },
      { code: 'C105', name: '立案開案申請表', desc: '內部立案正式開案申請' },
      { code: 'C106', name: '初步可行性評估', desc: '技術與成本初步可行性評估' },
      { code: 'C107', name: 'Kick-off Meeting 記錄', desc: '啟動會議記錄' },
      { code: 'C199', name: 'C1 Close Meeting 記錄', desc: 'C1 關卡會議記錄，需主管核准' },
    ],
  },
  C2: {
    name: 'C2 原型 (Prototype)',
    docs: [
      { code: 'C201', name: '產品開發作程計畫', desc: '整體立案作程，含 Phase milestone' },
      { code: 'C202', name: '概念設計規格（初稿）', desc: '產品功能與性能初稿規格' },
      { code: 'C203', name: '系統架構圖', desc: '硬體/軟體整體系統架構' },
      { code: 'C204', name: '關鍵零組件選用評估', desc: '關鍵零件選用與替代方案評估' },
      { code: 'C205', name: '可行性分析報告', desc: '技術與製造可行性分析結論' },
      { code: 'C206', name: '設計評審記錄 (Design Review)', desc: '設計評審會議記錄' },
      { code: 'C207', name: 'POC 樣品製作報告', desc: '概念驗証製作結果報告' },
      { code: 'C208', name: 'SoC Datasheet', desc: 'SoC 元件規格書' },
      { code: 'C209', name: 'Technical Reference Manual', desc: '技術參考手冊' },
      { code: 'C210', name: 'Module Design Guide', desc: '如何將 SOC 裝置載於模組板上' },
      { code: 'C211', name: 'Thermal Design Guide', desc: 'SOM 散熱設計規範' },
      { code: 'C299', name: 'C2 Close Meeting 記錄', desc: 'C2 關卡會議記錄，需主管核准' },
    ],
  },
  C3: {
    name: 'C3 EVT 樣品',
    docs: [
      { code: 'C300', name: 'Phase Check list', desc: '各階段離開必備文件確認清單' },
      { code: 'C301', name: '產品開發作程計畫', desc: '含各階段 milestone，需與客戶確認' },
      { code: 'C302', name: '試作需求書 (Sample Request Form)', desc: '記錄樣品所需的軟硬體版本與特殊需求' },
      { code: 'C303', name: '產品規格書（含內部規格）', desc: '最終產品設計規格，供 RD 功能定位依此展開' },
      { code: 'C304', name: 'BOM 料表 & 關鍵零件規格', desc: '8J BOM 組成，Level 5–8' },
      { code: 'C305', name: '製程流程圖（draft）', desc: '完整產品組裝路徑，需與製程廠確認' },
      { code: 'C306', name: 'D-FMEA / P-FMEA（draft）', desc: '設計與製程風險分析，使用第四版 RPN 評估' },
      { code: 'C307', name: 'Control Plan（draft）', desc: '針對 FMEA 高風險項目制定管控方法' },
      { code: 'C308', name: '設備治具需求書', desc: '製產所需治具與設備需求' },
      { code: 'C3081', name: '治具設計檢查表', desc: '治具驗收條件確認表' },
      { code: 'C310', name: 'EE Schematic（電子功能方塊圖）', desc: '電子功能設計方塊圖' },
      { code: 'C311', name: 'EE PCB Layout & Gerber file', desc: 'PCB 線路圖與製造文件檔' },
      { code: 'C312', name: 'EE 封裝設計圖（Package）', desc: 'COB 或模組封裝工程圖（如適用）' },
      { code: 'C318', name: 'EE 電路設計檢查表', desc: 'PCB/PCBA 設計 Design Rule 確認' },
      { code: 'C319', name: 'EE 電路設計驗證報告', desc: '電路設計依規格書測試之結果報告' },
      { code: 'C320', name: 'ME 示意圖 / 設計示意圖', desc: '機構零件相對位置示意' },
      { code: 'C321', name: 'ME 3D 機構工程圖', desc: 'SolidWorks 3D 設計檔案' },
      { code: 'C322', name: 'ME 2D 機構工程圖', desc: '依圖面給 IQC 用 2D 圖紙' },
      { code: 'C323', name: 'ME 外觀規格', desc: '客戶要求的外觀標準' },
      { code: 'C328', name: 'ME 機構設計檢查表', desc: '機構設計驗証確認書目' },
      { code: 'C329', name: 'ME 機構設計驗證報告', desc: '機構件確認與量測結果報告' },
      { code: 'C330', name: 'FW 韌體架構設計', desc: 'Chip firmware 架構與功能說明' },
      { code: 'C331', name: 'FW 韌體版本書定', desc: 'Firmware released version 記錄' },
      { code: 'C339', name: 'FW 韌體測試報告', desc: '韌體功能驗証測試結果' },
      { code: 'C340', name: 'OE 光學設計規格（如適用）', desc: '光學設計需求與規格' },
      { code: 'C349', name: 'OE 光學及影像驗證報告', desc: '光學與 IQ 驗証結果' },
      { code: 'C350', name: 'SW 軟體架構設計', desc: 'UI Application / 測試軟體架構' },
      { code: 'C360', name: '產品測試計畫（Test Plan）', desc: '涵蓋規格/功能/客戶測試項，需客戶確認' },
      { code: 'C361', name: 'IQC 入料檢驗規範', desc: '物料入料檢驗規格與判定標準' },
      { code: 'C369', name: '產品測試報告（Test Report）', desc: '依 C360 測試計畫執行的整機測試結果' },
      { code: 'C390', name: 'Issue List & 改善報告', desc: '客戶與內部問題書目，含根因分析與對策' },
      { code: 'C391', name: '批次試作報告（Trial Report）', desc: '每批樣品良率/CT/問題點彙整' },
      { code: 'C398', name: '客戶承認（EVT Green Line）', desc: '客戶正式承認 EVT 樣品與規格' },
      { code: 'C399', name: 'C3 Close Meeting 記錄', desc: 'EVT 關卡會議，需 QA 核准' },
    ],
  },
  C4: {
    name: 'C4 DVT 試作',
    docs: [
      { code: 'C400', name: 'Phase Check list', desc: 'DVT 階段文件需求確認書目' },
      { code: 'C401', name: '產品開發作程計畫（更新版）', desc: '更新 DVT 作程與資源配置' },
      { code: 'C402', name: '試作需求書', desc: 'DVT 樣品需求，含版本與特殊需求' },
      { code: 'C403', name: '產品規格書（Final）', desc: '設計定版，後續變更需走 ECN' },
      { code: 'C404', name: 'BOM（QVL 核定及定案版）', desc: '含核定廠商確認的最終 BOM' },
      { code: 'C405', name: '製程流程圖（Final）', desc: '最終版製程流程圖' },
      { code: 'C406', name: 'D-FMEA / P-FMEA（Final）', desc: '最終版風險分析，沿用 EVT 暫稿並依變更更新' },
      { code: 'C407', name: 'Control Plan（Final）', desc: '最終版製程管控計畫' },
      { code: 'C408', name: '製程治具需求書', desc: 'DVT 所需新增或改良治具需求' },
      { code: 'C4081', name: '製程治具檢查表', desc: '治具驗收條件確認' },
      { code: 'C410', name: 'EE 設計資料 & ECN 變更記錄', desc: 'EVT 後最新 EE 設計文件，含所有 ECN' },
      { code: 'C420', name: 'ME 設計資料 & ECN 變更記錄', desc: 'EVT 後最新 ME 設計文件，含所有 ECN' },
      { code: 'C430', name: 'FW 設計資料 & ECN 變更記錄', desc: 'EVT 後最新 FW 設計文件，含所有 ECN' },
      { code: 'C440', name: 'OE 設計資料 & ECN 變更記錄', desc: 'EVT 後最新 OE 設計文件，含所有 ECN' },
      { code: 'C450', name: 'SW 設計資料 & ECN 變更記錄', desc: 'EVT 後最新 SW 設計文件，含所有 ECN' },
      { code: 'C455', name: 'User Guide', desc: '產品使用手冊，提供客戶操作說明' },
      { code: 'C462', name: '首件尺寸量測報告（FAI / CPK）', desc: 'T-Final 全尺寸報告，含製程能力分析' },
      { code: 'C464', name: '關鍵材件參數分析', desc: '關鍵物料物理/電子性能參數 DOE 研究' },
      { code: 'C465', name: 'SOP 標準作業指導書', desc: 'DVT 設計固定後定稿發行' },
      { code: 'C466', name: 'SPC 統計製程管制表', desc: '客戶要求或關鍵特性不穩定時執行' },
      { code: 'C467', name: '關鍵製程參數分析', desc: 'DOE 實驗找出最佳製程參數' },
      { code: 'C468', name: 'GRR 量測系統分析', desc: '關鍵設備與治具的量測系統能力分析' },
      { code: 'C470', name: '安規測試計畫（Safety Test Plan）', desc: '定義安規測試項目，含 EMI/ESD/CE/RoHS' },
      { code: 'C471', name: 'EMI & EMC 認證報告', desc: '電磁干擾測試報告與第三方認證' },
      { code: 'C472', name: 'ESD 靜電放電認證報告', desc: '靜電放電測試報告與認證' },
      { code: 'C473', name: '安規認證報告', desc: '整體安規認證報告' },
      { code: 'C474', name: '備件承認測試報告', desc: '依條件進行的備件測試' },
      { code: 'C480', name: '可靠度測試計畫', desc: '定義測試項目/數量/條件/判定標準' },
      { code: 'C489', name: '可靠度測試報告', desc: '落下/磨耗/高溫高濕等可靠度測試結果' },
      { code: 'C469', name: '產品功能測試報告', desc: '整機功能驗証測試結果' },
      { code: 'C490', name: 'Issue List & 改善報告', desc: '所有問題必須結案或客戶認可 Waive' },
      { code: 'C491', name: '批次試作報告（良率/CT）', desc: '每批試作的良率趨勢、效率、問題分析' },
      { code: 'C498', name: '客戶承認（DVT Green Line）', desc: '客戶正式承認 DVT 樣品' },
      { code: 'C499', name: 'C4 Close Meeting 記錄', desc: 'DVT 關卡會議，需 QA 核准' },
    ],
  },
  C5: {
    name: 'C5 PVT 試量',
    docs: [
      { code: 'C501', name: 'PVT 試量產作程及計畫', desc: 'PVT 批量計畫與資源確定' },
      { code: 'C502', name: 'SOP 最終稿（含 WI）', desc: '量產用標準作業指導書最終稿' },
      { code: 'C503', name: '新治具 / 改良治具驗收報告', desc: 'PVT 新增或改良治具的驗收結果' },
      { code: 'C504', name: '製程參數優化報告', desc: 'PVT 製程參數調整結果' },
      { code: 'C505', name: 'SPC 統計製程管制表', desc: '量產用 SPC 管制圖' },
      { code: 'C560', name: 'OQC 出貨檢驗規範', desc: '出貨前成品檢驗標準與流程' },
      { code: 'C591', name: 'PVT 批次試作報告', desc: 'PVT 各批次良率/CT/問題彙整' },
      { code: 'C598', name: '客戶承認（PVT）', desc: '客戶正式承認 PVT 樣品' },
      { code: 'C599', name: 'C5 Close Meeting 記錄', desc: 'PVT 關卡會議，確認可進入量產' },
    ],
  },
  C6: {
    name: 'C6 量產 (MP)',
    docs: [
      { code: 'C601', name: '量產作程 & 出貨計畫', desc: '量產批量與出貨作程管理' },
      { code: 'C602', name: 'OQC 出貨檢驗報告', desc: '每批出貨的 OQC 檢驗記錄' },
      { code: 'C603', name: '客戶出貨資料（CoC / Data Pack）', desc: '出貨隨附的品質文件' },
      { code: 'C604', name: '定期品質報告（月報）', desc: '月度品質趨勢與異常報告' },
      { code: 'C610', name: 'ECN 工程變更記錄', desc: '量產期間設計或製程變更記錄' },
      { code: 'C620', name: '良率趨勢分析報告', desc: '量產良率趨勢監控' },
      { code: 'C630', name: '客訴 / 退貨處理記錄（8D）', desc: '客戶投訴的根因分析與改善報告' },
    ],
  },
  C7: {
    name: 'C7 停產 (EOL)',
    docs: [
      { code: 'C701', name: '停產通知書（EOL Notice）', desc: '正式通知客戶停產計畫' },
      { code: 'C702', name: '最後採購計畫（Last Buy）', desc: '最後一批物料採購規劃' },
      { code: 'C703', name: '庫存 & 在製品處置計畫', desc: '剩餘庫存與在製品的處置方案' },
      { code: 'C704', name: '成本與責任結算報告', desc: '最終成本結算與責任認定' },
      { code: 'C705', name: '客戶技術文件移交書', desc: '移交給客戶的技術文件書目' },
      { code: 'C706', name: '立案文件封存記錄（DCC）', desc: '所有 PDM 文件存檔記錄' },
      { code: 'C799', name: 'C7 結案會議記錄', desc: '立案正式結案會議記錄' },
    ],
  },
};

// 從檔名 / docId 擷取 NPDS 編號（C + 階段碼1–7 + 至少兩位數字，如 C560、C3081）。
// 取不到回傳 null；以大寫回傳以利去重比對。
function extractNpdsCode(name) {
  const m = String(name).match(/C[1-7]\d{2,}/i);
  return m ? m[0].toUpperCase() : null;
}

// excludeCodes：已上傳的 NPDS 編號集合（Set，大寫）。輸出目錄時略過這些編號的項目；
// 若某階段所有文件都被排除，連階段標題一併略過。未傳則輸出完整目錄（向後相容）。
function formatCatalogForPrompt(excludeCodes) {
  const exclude = excludeCodes || new Set();
  return Object.entries(NPDS_CATALOG)
    .map(([phase, { name, docs }]) => {
      const visible = docs.filter(d => !exclude.has(d.code.toUpperCase()));
      if (visible.length === 0) return null;
      const docLines = visible.map(d => `  - ${d.code} ${d.name}：${d.desc}`).join('\n');
      return `${name}\n${docLines}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

module.exports = { NPDS_CATALOG, formatCatalogForPrompt, extractNpdsCode };
