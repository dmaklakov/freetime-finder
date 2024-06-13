var express = require("express");
var router = express.Router();
var bcrypt = require("bcrypt");
var jwt = require("jsonwebtoken");
var db = require("../database");
const url = require("url");

var WebSocket = require("ws");

// Websocket for events
const clientsEvent = {};
const wss = new WebSocket.Server({ port: 3002 });
wss.on("connection", (ws, req) => {
  const pathname = url.parse(req.url).pathname;
  const eventId = pathname.split("/").pop(); // Extract event ID from URL

  if (!clientsEvent[eventId]) {
    clientsEvent[eventId] = [];
  }
  clientsEvent[eventId].push(ws);

  ws.on("close", () => {
    clientsEvent[eventId] = clientsEvent[eventId].filter(
      (client) => client !== ws
    );
  });
});

function broadcastEvent(eventId, message) {
  const messageSend = JSON.stringify(message);
  if (clientsEvent[eventId]) {
    clientsEvent[eventId].forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageSend);
      }
    });
  }
}

async function notifyInterestedEvents(userId) {
  const onlineEvents = Object.keys(clientsEvent).filter(
    (eventId) => eventId !== "all"
  );
  const result = await db.users.getListeningEvents(userId, onlineEvents);
  Object.entries(result).forEach(([key, events]) => {
    events.forEach((event) => {
      broadcastEvent(event.eventId, { op: key });
    });
  });
}

// Websocket for profile
const clientsProfile = {};
const wssProfile = new WebSocket.Server({ port: 3003 });
wssProfile.on("connection", (ws, req) => {
  const pathname = url.parse(req.url).pathname;
  const userId = pathname.split("/").pop(); // Extract user ID from URL

  if (!clientsProfile[userId]) {
    clientsProfile[userId] = [];
  }
  clientsProfile[userId].push(ws);

  ws.on("close", () => {
    clientsProfile[userId] = clientsProfile[userId].filter(
      (client) => client !== ws
    );
  });
});

function broadcastProfile(userId, message) {
  const messageSend = JSON.stringify(message);
  if (clientsProfile[userId]) {
    clientsProfile[userId].forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageSend);
      }
    });
  }
}

async function notifyInterestedUsers(eventId) {
  const onlineUsers = Object.keys(clientsProfile).filter(
    (userId) => userId !== "all"
  );
  const result = await db.events.getListeningUsers(eventId, onlineUsers);
  Object.entries(result).forEach(([key, users]) => {
    users.forEach((user) => {
      broadcastProfile(user.userId, { op: key });
    });
  });
}

// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
  if (!req.jwtProvided) {
    console.log("Denied: Authentication required");
    return res.status(401).send("Authentication required");
  } else if (req.jwtVerifyError || req.jwtExpired) {
    console.log("Denied: Invalid authentication token");
    return res.status(401).send("Invalid authentication token");
  }
  next();
}

router.get("/rankings", async function (req, res) {
  try {
    const rankings = {
      comments: await db.rankings.getUsersWithMostComments(),
      registrations: await db.rankings.getEventsWithMostRegistrations(),
      averages: await db.rankings.getEventsWithBestAverageUpvotes(),
    };

    res.send(rankings);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/users/interested/:userId", isLoggedIn, async function (req, res) {
  try {
    const events = await db.users.getInterestedEvents(req.params.userId);
    res.send(events);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/users", isLoggedIn, async function (req, res) {
  try {
    const user = await db.users.getUserOnEmailNickname(req.jwtPayload.email);
    res.send(user);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/users/:userId", isLoggedIn, async function (req, res) {
  try {
    const user = await db.users.getUserOnId(req.params.userId);
    if (user) {
      res.send(user);
    } else {
      res.status(404).send({ success: false, message: "User not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.put("/users/:userId", isLoggedIn, async function (req, res) {
  try {
    const userExists = await db.users.checkNicknameOrEmailRegistered(
      req.body.nickname,
      req.body.email
    );

    if (userExists && userExists.ID !== req.body.ID) {
      res.status(409).send({
        success: false,
        message: "User with such email or nickname already exists!",
      });
      return;
    }

    const user = await db.users.updateUserOnId(req.params.userId, req.body);
    if (user) {
      notifyInterestedEvents(req.params.userId);
      broadcastProfile("all", { op: "user" });
      res.send(user);
    } else {
      res.status(404).send({ success: false, message: "User not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.put("/events/create", isLoggedIn, async function (req, res) {
  try {
    const event = await db.events.addEvent(req.body);
    broadcastEvent("all", { op: "event" });
    res.send(event);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/events/all", async function (req, res) {
  try {
    const events = await db.events.getAllEvents();
    res.send(events);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/events/filtered", async function (req, res) {
  try {
    const events = await db.events.getEventsOnFilters(req.body);
    res.send(events);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get(
  "/events/interested/:eventId",
  isLoggedIn,
  async function (req, res) {
    try {
      const onlineUsers = Object.keys(clientsProfile);
      const users = await db.events.getListeningUsers(
        req.params.eventId,
        onlineUsers
      );
      res.send(users);
    } catch (error) {
      res.status(500).send({ success: false, message: error.message });
    }
  }
);

router.get("/events/:eventId", async function (req, res) {
  try {
    const event = await db.events.getEventOnId(req.params.eventId);
    if (event) {
      res.send(event);
    } else {
      res.status(404).send({ success: false, message: "Event not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.put("/events/:eventId", isLoggedIn, async function (req, res) {
  try {
    const event = await db.events.updateEventOnId(req.params.eventId, req.body);
    if (event) {
      broadcastEvent(req.params.eventId, { op: "event" });
      broadcastEvent("all", { op: "event" });
      notifyInterestedUsers(req.params.eventId);
      res.send(event);
    } else {
      res.status(404).send({ success: false, message: "Event not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.delete("/events/:eventId", isLoggedIn, async function (req, res) {
  try {
    const event = await db.events.deleteEventOnId(req.params.eventId);
    if (event) {
      broadcastEvent(req.params.eventId, { op: "event" });
      broadcastEvent("all", { op: "event" });
      notifyInterestedUsers(req.params.eventId);
      res.send(event);
    } else {
      res.status(404).send({ success: false, message: "Event not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.put("/registrations/create", isLoggedIn, async function (req, res) {
  try {
    const registration = await db.registrations.addRegistration(req.body);
    broadcastEvent(req.body.eventId, { op: "registration" });
    broadcastProfile(req.body.userId, { op: "registration" });
    broadcastEvent("all", { op: "registration" });
    res.send(registration);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.delete(
  "/registrations/:registrationId",
  isLoggedIn,
  async function (req, res) {
    try {
      const registration = await db.registrations.deleteRegistrationOnId(
        req.params.registrationId
      );
      if (registration) {
        broadcastEvent(req.body.eventId, { op: "registration" });
        broadcastProfile(req.body.userId, { op: "registration" });
        broadcastEvent("all", { op: "registration" });
        res.send(registration);
      } else {
        res
          .status(404)
          .send({ success: false, message: "Registration not found" });
      }
    } catch (error) {
      res.status(500).send({ success: false, message: error.message });
    }
  }
);

router.get("/registrations/event/:eventId", async function (req, res) {
  try {
    const registrations = await db.registrations.getRegistrationsOnEventId(
      req.params.eventId
    );
    res.send(registrations);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get(
  "/registrations/user/:userId",
  isLoggedIn,
  async function (req, res) {
    try {
      const registrations = await db.registrations.getRegistrationsOnUserId(
        req.params.userId
      );
      res.send(registrations);
    } catch (error) {
      res.status(500).send({ success: false, message: error.message });
    }
  }
);

router.put("/comments/create", isLoggedIn, async function (req, res) {
  try {
    const comment = await db.comments.addComment(req.body);
    broadcastEvent(req.body.eventId, { op: "comment" });
    broadcastProfile(req.body.userId, { op: "comment" });
    broadcastEvent("all", { op: "comment" });
    res.send(comment);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/comments/:commentId", isLoggedIn, async function (req, res) {
  try {
    const comment = await db.comments.getCommentOnId(req.params.commentId);
    if (comment) {
      res.send(comment);
    } else {
      res.status(404).send({ success: false, message: "Comment not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.put("/comments/:commentId", isLoggedIn, async function (req, res) {
  try {
    const comment = await db.comments.updateCommentOnId(
      req.params.commentId,
      req.body
    );
    if (comment) {
      broadcastEvent(req.body.eventId, { op: "comment" });
      broadcastProfile(req.body.userId, { op: "comment" });
      broadcastEvent("all", { op: "comment" });
      res.send(comment);
    } else {
      res.status(404).send({ success: false, message: "Comment not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.delete("/comments/:commentId", isLoggedIn, async function (req, res) {
  try {
    const comment = await db.comments.deleteCommentOnId(req.params.commentId);
    if (comment) {
      broadcastEvent(req.body.eventId, { op: "comment" });
      broadcastProfile(req.body.userId, { op: "comment" });
      broadcastEvent("all", { op: "comment" });
      res.send(comment);
    } else {
      res.status(404).send({ success: false, message: "Comment not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/comments/event/:eventId", async function (req, res) {
  try {
    const comments = await db.comments.getCommentsOnEventId(req.params.eventId);
    res.send(comments);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/comments/user/:userId", isLoggedIn, async function (req, res) {
  try {
    const comments = await db.comments.getCommentsOnUserId(req.params.userId);
    res.send(comments);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.put("/upvotes/create", isLoggedIn, async function (req, res) {
  try {
    const upvote = await db.upvotes.addUpvote(req.body);
    broadcastEvent(req.body.eventId, { op: "upvote" });
    broadcastProfile(req.body.userId, { op: "upvote" });
    broadcastEvent("all", { op: "upvote" });
    res.send(upvote);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.delete("/upvotes/:upvoteId", isLoggedIn, async function (req, res) {
  try {
    const upvote = await db.upvotes.deleteUpvoteOnId(req.params.upvoteId);
    if (upvote) {
      broadcastEvent(req.body.eventId, { op: "upvote" });
      broadcastProfile(req.body.userId, { op: "upvote" });
      broadcastEvent("all", { op: "upvote" });
      res.send(upvote);
    } else {
      res.status(404).send({ success: false, message: "Upvote not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/upvotes/event/:eventId", async function (req, res) {
  try {
    const upvotes = await db.upvotes.getUpvotesOnEventId(req.params.eventId);
    res.send(upvotes);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/upvotes/user/:userId", isLoggedIn, async function (req, res) {
  try {
    const upvotes = await db.upvotes.getUpvotesOnUserId(req.params.userId);
    res.send(upvotes);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/free", async function (req, res) {
  try {
    const event = await db.free.conductTextRequest(req.body.request);
    res.send(event);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/", function (req, res) {
  console.log(req.body);
  res.send("API is working properly");
});

module.exports = router;
