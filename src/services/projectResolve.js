// 把使用者輸入的 --project（可能是 project id 或 name）解析成真正的 project id。
// 先比 id（完全相符），再比 name；都找不到回 null。
function resolveProjectId(projects, input) {
  if (projects.some(p => p.id === input)) return input;
  const byName = projects.find(p => p.name === input);
  return byName ? byName.id : null;
}

module.exports = { resolveProjectId };
