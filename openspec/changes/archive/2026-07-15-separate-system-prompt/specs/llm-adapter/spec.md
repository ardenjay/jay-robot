## ADDED Requirements

### Requirement: System-role content maps to the provider-native system channel
`chatWithTools(contents, tools)` 的 `contents` 首元素 MAY 為 `{role: 'system', parts: [{text}]}`。各 adapter SHALL 將其對映到該 provider 的原生 system 通道：`OllamaAdapter` → `{role: 'system', content}` message；`GeminiAdapter` → SDK 的 `systemInstruction` 參數（該元素不得混入 Gemini `contents`）；mock adapter → 以 user 元素全文為問題。contents 無 system 元素時，各 adapter SHALL 維持原行為（向後相容）。

#### Scenario: Ollama maps system element to system message
- **WHEN** contents 首元素為 system role，經 `OllamaAdapter.chatWithTools` 送出
- **THEN** Ollama 請求的 messages[0] 為 `{role:'system', content:<指令>}`，問題在後續 user message

#### Scenario: Gemini maps system element to systemInstruction
- **WHEN** contents 首元素為 system role，經 `GeminiAdapter.chatWithTools` 送出
- **THEN** 指令以 `systemInstruction` 傳給 SDK，送出的 `contents` 不含該元素

#### Scenario: Contents without system element unchanged
- **WHEN** contents 首元素為 user（舊格式）
- **THEN** 各 adapter 行為與現行版本相同
