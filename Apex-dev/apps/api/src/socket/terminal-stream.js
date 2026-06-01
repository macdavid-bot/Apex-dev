import { Server } from 'socket.io';

export function initializeTerminalStreaming(server) {
  const io = new Server(server, {
    cors: {
      origin: '*'
    }
  });

  io.on('connection', (socket) => {
    console.log('Terminal client connected');

    socket.on('terminal:input', (data) => {
      socket.emit('terminal:output', {
        output: `Received command: ${data.command}`
      });
    });

    socket.on('disconnect', () => {
      console.log('Terminal client disconnected');
    });
  });

  return io;
}
