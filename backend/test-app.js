const { io } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://127.0.0.1:5000';

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- Starting comprehensive tests ---');

  // Helper to connect a new client
  const connectClient = (query = {}) => {
    return new Promise((resolve, reject) => {
      const socket = io(SERVER_URL, { query, transports: ['websocket'] });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
      socket.on('error', (err) => {
        if (err.code === 'TOO_MANY_CONNECTIONS') {
          resolve(socket); // Resolve anyway to inspect the error, though socket is disconnected
        }
      });
    });
  };

  try {
    console.log('1. Testing Connection & User Assignment...');
    const client1 = await connectClient();
    
    let client1Data = null;
    await new Promise((resolve) => {
      client1.once('user_assigned', (data) => {
        client1Data = data;
        assert(data.userId, 'User should have a userId');
        assert(data.nickname, 'User should have a nickname');
        resolve();
      });
    });
    console.log(`Client 1 connected as ${client1Data.nickname} (#${client1Data.userId})`);

    console.log('\n2. Testing Rate Limiting (5 msgs / 10s)...');
    let rateLimitHit = false;
    client1.on('rate_limit', (err) => {
      rateLimitHit = true;
      console.log('Rate limit triggered successfully:', err.message);
    });

    for (let i = 0; i < 7; i++) {
      await new Promise((resolve) => {
        client1.emit('send_message', { message: `Spam msg ${i}` }, (res) => {
          console.log(`Msg ${i} res:`, res);
          if (res && res.error && res.error.code === 'RATE_LIMITED') {
            rateLimitHit = true;
          }
          resolve();
        });
      });
    }
    assert(rateLimitHit, 'Rate limit should have been hit for sending 6+ messages quickly');

    console.log('\n3. Testing Room Creation & Isolation...');
    const client2 = await connectClient();
    const client3 = await connectClient();
    
    let newRoom = null;
    await new Promise((resolve) => {
      client2.emit('create_room', { name: 'Test Secret Room', isPublic: false }, (res) => {
        assert(res.ok, 'Room creation should succeed');
        newRoom = res.room;
        resolve();
      });
    });
    console.log(`Created private room: ${newRoom.roomId}`);

    // Join client 2 to the new room
    await new Promise((resolve) => {
      client2.emit('join_room', { roomId: newRoom.roomId }, (res) => {
        assert(res.ok, 'Client 2 should join room');
        resolve();
      });
    });
    
    // Client 3 stays in global. Client 2 sends a message in the new room.
    let client3Received = false;
    client3.on('receive_message', (msg) => {
      client3Received = true;
    });

    let client2Received = false;
    client2.on('receive_message', (msg) => {
      if (msg.message === 'Hello secret room!') client2Received = true;
    });

    client2.emit('send_message', { message: 'Hello secret room!' }, (res) => {
      assert(res.ok, 'Message send should succeed');
    });

    await delay(500);
    assert(client2Received, 'Client 2 should receive its own message back from the room broadcast');
    assert(!client3Received, 'Client 3 in global room should NOT receive a message sent to the private room');
    console.log('Room isolation verified.');

    console.log('\n4. Testing Connection Caps (Max 5 per IP)...');
    const sockets = [client1, client2, client3];
    let tooManyConnectionsError = false;

    // Try opening 4 more connections (total 7, which should trigger the limit of 5)
    for (let i = 0; i < 4; i++) {
      const s = io(SERVER_URL, { transports: ['websocket'] });
      s.on('error', (err) => {
        if (err.code === 'TOO_MANY_CONNECTIONS') tooManyConnectionsError = true;
      });
      sockets.push(s);
      await delay(100); // Slight stagger
    }
    
    await delay(1000);
    assert(tooManyConnectionsError, 'The 6th connection from this IP should be rejected due to max cap');
    console.log('Connection cap verified.');

    console.log('\n5. Cleaning up...');
    for (const s of sockets) {
      if (s.connected) s.disconnect();
    }

    console.log('\n✅ All tests passed successfully!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
