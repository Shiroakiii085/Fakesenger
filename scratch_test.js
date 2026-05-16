import * as https from "https";

// We need a real OpenRouter key to test if valid key + invalid model returns 200 or 400.
// But we don't have one.
// The user says "chat:1 (Trả về kết quả thông báo lá 'ChatBot AI chưa trả về nội dung')".
// If readAssistantText failed because OpenRouter returned something different for successful completions?
