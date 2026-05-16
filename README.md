# Student Messenger

Web chat realtime như Messenger ở mức sinh viên, tách rõ backend và frontend nhưng vẫn deploy miễn phí dễ nhất bằng Vercel.

## Stack

- Frontend: Next.js App Router, React, CSS thuần.
- Backend: Next.js API Routes trong thư mục `app/api`.
- Auth, database, realtime: Supabase free tier.
- Chatbot AI: OpenRouter Chat Completions API qua route backend riêng.
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
- Trợ lý AI trong thanh cuộc trò chuyện.
- Gọi `@ChatBot` trực tiếp trong nhóm hoặc kênh để bot phản hồi trong phòng chat.

## Chạy local

1. Tạo project Supabase mới.
2. Vào Supabase SQL Editor, chạy toàn bộ file `supabase/schema.sql`.
3. Vào Authentication > Providers > Email, có thể tắt Confirm email để demo sinh viên nhanh hơn.
4. Copy `.env.example` thành `.env.local` và điền:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-5-mini
```

5. Cài và chạy:

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

Không cần server riêng. Vercel và Supabase vẫn có thể chạy trong free tier, nhưng chatbot AI dùng OpenRouter nên sẽ phát sinh chi phí theo model bạn chọn.

## Bảo mật biến môi trường

- Không commit file `.env`, `.env.local`, `.env.production` hoặc bất kỳ file `.env.*` nào khác.
- Chỉ giữ placeholder trong `.env.example`.
- `OPENROUTER_API_KEY` chỉ được đặt trong Environment Variables của Vercel hoặc file môi trường local, không dùng tiền tố `NEXT_PUBLIC_`.
- Các khóa bí mật khác cũng không được đưa vào mã nguồn hay trình duyệt.
