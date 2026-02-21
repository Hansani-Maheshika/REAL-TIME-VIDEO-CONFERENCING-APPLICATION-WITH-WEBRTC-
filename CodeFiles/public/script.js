// Connect to socket server
const socket = io();

// Get HTML elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const sendBtn = document.getElementById("sendBtn");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");

let localStream;
let peerConnection;

// STUN server configuration
const servers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

// 1️⃣ Get Camera & Microphone
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        createPeerConnection();

        // Add local tracks to connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Create offer automatically
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("offer", offer);

    } catch (error) {
        console.error("Error accessing media devices.", error);
    }
}

// 2️⃣ Create Peer Connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);

    // When remote stream arrives
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // When ICE candidate generated
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate);
        }
    };
}

// 3️⃣ Receive Offer
socket.on("offer", async (offer) => {
    if (!peerConnection) createPeerConnection();

    await peerConnection.setRemoteDescription(offer);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", answer);
});

// 4️⃣ Receive Answer
socket.on("answer", async (answer) => {
    await peerConnection.setRemoteDescription(answer);
});

// 5️⃣ Receive ICE Candidate
socket.on("ice-candidate", async (candidate) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error("Error adding ICE candidate", error);
    }
});

// ======================
// 💬 CHAT FEATURE
// ======================

sendBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (message === "") return;

    addMessage("Me: " + message);
    socket.emit("chat-message", message);
    chatInput.value = "";
};

socket.on("chat-message", message => {
    addMessage("Friend: " + message);
});

function addMessage(text) {
    const li = document.createElement("li");
    li.textContent = text;
    messages.appendChild(li);
}

// ======================
// 🔇 MUTE FEATURE
// ======================

muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];

    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        muteBtn.textContent = "Unmute";
    } else {
        audioTrack.enabled = true;
        muteBtn.textContent = "Mute";
    }
};

// ======================
// 📷 CAMERA TOGGLE
// ======================

cameraBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];

    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        cameraBtn.textContent = "Camera On";
    } else {
        videoTrack.enabled = true;
        cameraBtn.textContent = "Camera Off";
    }
};

// Start everything
init();