-- Remove the legacy ChatBot integration from an existing database.
drop function if exists public.insert_chatbot_message(uuid, text);

-- Deleting the auth user cascades to the matching profile and any messages
-- authored by the bot through the existing foreign-key relationships.
delete from auth.users
where id = '00000000-0000-0000-0000-000000000000';
