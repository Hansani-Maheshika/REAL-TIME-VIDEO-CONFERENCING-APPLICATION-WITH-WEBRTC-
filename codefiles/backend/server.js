const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Join room
    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        socket.roomId = roomId;

        console.log(`${socket.id} joined room ${roomId}`);

        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

        // Send existing users to new user
        socket.emit("existing-users", clients.filter(id => id !== socket.id));

        // Notify others
        socket.to(roomId).emit("user-connected", socket.id);
    });

    // Offer
    socket.on("offer", ({ offer, to }) => {
        io.to(to).emit("offer", { offer, from: socket.id });
    });

    // Answer
    socket.on("answer", ({ answer, to }) => {
        io.to(to).emit("answer", { answer, from: socket.id });
    });

    // ICE Candidate
    socket.on("ice-candidate", ({ candidate, to }) => {
        io.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });

    // Chat (room based)
    socket.on("chat-message", (message) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit("chat-message", message);
        }
    });

    // Disconnect
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        if (socket.roomId) {
            socket.to(socket.roomId).emit("user-disconnected", socket.id);
        }
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:3000");
});