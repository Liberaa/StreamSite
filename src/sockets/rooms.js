// Socket.IO room names.
// Viewers join the chat room of the channel they are watching. The creator
// dashboard joins the status room instead: it gets live/offline updates and
// viewer counts, but no chat, and it does not count as a viewer.
export const chatRoom = (username) => `chat:${username}`;
export const statusRoom = (username) => `status:${username}`;
export const channelRooms = (username) => [chatRoom(username), statusRoom(username)];
