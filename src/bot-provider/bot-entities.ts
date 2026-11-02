export enum ChatType {
  Supergroup = 'supergroup',
  Private = 'private',
}

export interface ChatBase {
  id: number;
  type: ChatType;
}

export interface SupergroupChat extends ChatBase {
  title: string;
}

export interface PrivateChat extends ChatBase {
  first_name: string;
  username: string;
}

export type Chat = SupergroupChat | PrivateChat;

export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  language_code: string;
}

export interface MessageEntity {
  offset: number;
  length: number;
  type: string;
}

export interface UserMessage {
  message_id: number;
  from: User;
  chat: Chat;
  date: number;
  text: string;
  entities: MessageEntity[];
}
