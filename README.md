# Student Messenger

Web chat realtime như Messenger ở mức sinh viên, tách rõ backend và frontend nhưng vẫn deploy miễn phí dễ nhất bằng Vercel.

## Stack

- Frontend: Next.js App Router, React, CSS thuần.
- Backend: Next.js API Routes trong thư mục `app/api`.
- Auth, database, realtime: Supabase free tier.
- Deploy: Vercel free tier.

## Chức năng

- Đăng ký, đăng nhập bằng email/password.
- Chat 1:1.
- Chat nhóm N-N, mọi thành viên đều nhắn được.
- Kênh 1:N, chỉ admin được gửi tin nhắn.
- Tìm người dùng theo email hoặc tên hiển thị.
- Tạo nhóm/kênh và thêm thành viên.
- Tin nhắn realtime qua Supabase Realtime.
- Cập nhật tên hiển thị và trạng thái.
- Trợ lý AI qua OpenRouter, mặc định dùng `openai/gpt-4.1-mini` và chỉ bật web search khi câu hỏi cần dữ liệu mới.

## Chạy local

1. Tạo project Supabase mới.
2. Vào Supabase SQL Editor, chạy toàn bộ file `supabase/schema.sql`.
3. Vào Authentication > Providers > Email, có thể tắt Confirm email để demo sinh viên nhanh hơn.
4. Nếu bạn đang nâng cấp từ bản cũ đã có database, chạy thêm:
   - `supabase/add-ai-chat-jobs.sql` để bật chế độ tiếp tục xử lý câu hỏi AI khi người dùng rời tab.
   - `supabase/add-message-notifications.sql` để bật thông báo cho mọi tin nhắn mới, không chỉ riêng `@mention`.

5. Copy `.env.example` thành `.env.local` và điền:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-4.1-mini
```

`OPENROUTER_SITE_URL` và `OPENROUTER_APP_NAME` là tuỳ chọn; có thể giữ mặc định trong `.env.example`.
Web search của OpenRouter là tính năng riêng và có thể phát sinh phí tìm kiếm nhỏ nếu model gọi công cụ này, dù bản thân model đang dùng là free.

6. Cài và chạy:

```bash
npm install
npm run dev
```

## Deploy Vercel

1. Push source lên GitHub.
2. Import repo vào Vercel.
3. Thêm các biến môi trường:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
4. Deploy.

Không cần server riêng. Vercel và Supabase vẫn có thể chạy trong free tier.

## Bảo mật biến môi trường

- Không commit file `.env`, `.env.local`, `.env.production` hoặc bất kỳ file `.env.*` nào khác.
- Chỉ giữ placeholder trong `.env.example`.
- Các khóa bí mật khác cũng không được đưa vào mã nguồn hay trình duyệt.
