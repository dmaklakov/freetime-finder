const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.resolve(__dirname, "database.db");
var dotenv = require("dotenv").config();
const fs = require("fs");
const { on } = require("events");

const db = createConnection();

function createConnection() {
  if (fs.existsSync(dbPath)) {
    console.log("Connection with existing SQLite has been established");
    return new sqlite3.Database(dbPath);
  } else {
    const db = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        return console.error(error.message);
      }
      createDatabase(db);
      console.log("Database was generated");
    });
    console.log("Connection with SQLite has been established");
    return db;
  }
}

function createDatabase() {
  db.exec(`
        CREATE TABLE IF NOT EXISTS Users (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            firstname TEXT,
            lastname TEXT,
            email TEXT,
            password TEXT,
            nickname TEXT,
            createdAt TIMESTAMP,
            lastLogin TIMESTAMP,
            status INTEGER,
            blocked BOOLEAN
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS Events (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            location TEXT,
            title TEXT,
            description TEXT,
            preview TEXT,
            image TEXT,
            tags TEXT, 
            start TIMESPAMP,
            end TIMESTAMP,
            addedBy INTEGER
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS Registrations (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            eventId INTEGER,
            date TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES Users(ID),
            FOREIGN KEY (eventId) REFERENCES Events(ID)
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS Comments (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            eventId INTEGER,
            added TIMESTAMP,
            headline TEXT,
            comment TEXT,
            FOREIGN KEY (userId) REFERENCES Users(ID),
            FOREIGN KEY (eventId) REFERENCES Events(ID)
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS Upvotes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            eventId INTEGER,
            points INTEGER,
            date TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES Users(ID),
            FOREIGN KEY (eventId) REFERENCES Events(ID)
        )
    `);
}

async function checkNicknameOrEmailRegistered(nickname, email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM Users WHERE nickname = ? OR email = ?`,
      [nickname, email],
      (err, row) => {
        if (err) {
          reject(err);
        }
        resolve(row);
      }
    );
  });
}

async function checkCorrectLoginCredentials(email, password) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM Users WHERE email = ? AND password = ?`,
      [email, password],
      (err, row) => {
        if (err) {
          reject(err);
        }
        resolve(row);
      }
    );
  });
}

async function addUser(user) {
  // Only firstname, lastname, email, password, nickname
  return new Promise((resolve, reject) => {
    db.run(
      `
            INSERT INTO Users (firstname, lastname, email, password, nickname, createdAt, status, blocked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        user.firstname,
        user.lastname,
        user.email,
        user.password,
        user.nickname,
        new Date().toISOString(),
        user.status ?? 1,
        false,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID.toString());
        }
      }
    );
  });
}

async function getUserOnEmailNickname(login) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM Users WHERE email = ? OR nickname = ?`,
      [login, login],
      (err, row) => {
        if (err) {
          reject(err);
        }
        resolve(row);
      }
    );
  });
}

async function getUserOnId(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM Users WHERE ID = ?`, [id], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });
}

async function updateUserOnId(id, user) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            UPDATE Users
            SET firstname = ?, lastname = ?, email = ?, password = ?, nickname = ?
            WHERE ID = ?
        `,
      [
        user.firstname,
        user.lastname,
        user.email,
        user.password,
        user.nickname,
        id,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes.toString());
        }
      }
    );
  });
}

async function updateUserStatusOnId(id, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            UPDATE Users
            SET status = ?
            WHERE ID = ?
        `,
      [status, id],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes.toString());
        }
      }
    );
  });
}

async function updateUserLastLoginOnId(id) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            UPDATE Users
            SET lastLogin = ?
            WHERE ID = ?
        `,
      [new Date().toISOString(), id],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes.toString());
        }
      }
    );
  });
}

async function getInterestedEvents(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DISTINCT eventId FROM (SELECT eventId FROM Registrations WHERE userId = ? UNION SELECT eventId FROM Comments WHERE userId = ? UNION SELECT eventId FROM Upvotes WHERE userId = ?) AS AllEvents`,
      [userId, userId, userId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function addEvent(event) {
  return new Promise((resolve, reject) => {
    if (
      !event.location ||
      !event.title ||
      !event.description ||
      !event.preview ||
      !event.image ||
      !event.tags ||
      !event.start ||
      !event.end ||
      !event.addedBy
    ) {
      reject("Missing required fields");
    }
    db.run(
      `
            INSERT INTO Events (location, title, description, preview, image, tags, start, end, addedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        event.location,
        event.title,
        event.description,
        event.preview,
        event.image,
        event.tags,
        event.start,
        event.end,
        event.addedBy,
      ],
      function (err) {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          resolve(this.lastID.toString());
        }
      }
    );
  });
}

async function getEventOnId(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM Events WHERE ID = ?`, [id], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });
}

async function deleteEventOnId(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM Events WHERE ID = ?`, [id], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes.toString());
      }
    });
  });
}

async function updateEventOnId(id, event) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            UPDATE Events
            SET location = ?, title = ?, description = ?, preview = ?, image = ?, tags = ?, start = ?, end = ?
            WHERE ID = ?
        `,
      [
        event.location,
        event.title,
        event.description,
        event.preview,
        event.image,
        event.tags,
        event.start,
        event.end,
        id,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes.toString());
        }
      }
    );
  });
}

async function getEventsOnFilters(filters) {
  // provided: filters.text for location, title, description, preview, tags; filters.start for start and filters.end for end
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM Events WHERE 1=1`;
    let params = [];

    if (filters.text) {
      query += ` AND (LOWER(location) LIKE LOWER(?) OR LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR LOWER(preview) LIKE LOWER(?) OR LOWER(tags) LIKE LOWER(?))`;
      params.push(
        `%${filters.text}%`,
        `%${filters.text}%`,
        `%${filters.text}%`,
        `%${filters.text}%`,
        `%${filters.text}%`
      );
    }

    if (filters.start) {
      query += ` AND start >= ?`;
      params.push(filters.start);
    }

    if (filters.end) {
      query += ` AND end <= ?`;
      params.push(filters.end);
    }

    query += ` ORDER BY end DESC`;

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function getAllEvents() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM Events ORDER BY end DESC`, (err, rows) => {
      if (err) {
        reject(err);
      }
      resolve(rows);
    });
  });
}

async function getListeningUsers(eventId, onlineUsersIdsList) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = {};

      const registrationPromise = new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT userId FROM Registrations WHERE eventId = ? AND userId IN (${onlineUsersIdsList.join(
            ","
          )})`,
          [eventId],
          (err, rows) => {
            if (err) {
              reject(err);
            }
            result["registration"] = rows;
            resolve();
          }
        );
      });

      const commentPromise = new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT userId FROM Comments WHERE eventId = ? AND userId IN (${onlineUsersIdsList.join(
            ","
          )})`,
          [eventId],
          (err, rows) => {
            if (err) {
              reject(err);
            }
            result["comment"] = rows;
            resolve();
          }
        );
      });

      const upvotePromise = new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT userId FROM Upvotes WHERE eventId = ? AND userId IN (${onlineUsersIdsList.join(
            ","
          )})`,
          [eventId],
          (err, rows) => {
            if (err) {
              reject(err);
            }
            result["upvote"] = rows;
            resolve();
          }
        );
      });

      await Promise.all([registrationPromise, commentPromise, upvotePromise]);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

async function getListeningEvents(userId, onlineEventsIdsList) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = {};

      const registrationPromise = new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT eventId FROM Registrations WHERE userId = ? AND eventId IN (${onlineEventsIdsList.join(
            ","
          )})`,
          [userId],
          (err, rows) => {
            if (err) {
              reject(err);
            }
            result["registration"] = rows;
            resolve();
          }
        );
      });

      const commentPromise = new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT eventId FROM Comments WHERE userId = ? AND eventId IN (${onlineEventsIdsList.join(
            ","
          )})`,
          [userId],
          (err, rows) => {
            if (err) {
              reject(err);
            }
            result["comment"] = rows;
            resolve();
          }
        );
      });

      const upvotePromise = new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT userId FROM Upvotes WHERE userId = ? AND eventId IN (${onlineEventsIdsList.join(
            ","
          )})`,
          [userId],
          (err, rows) => {
            if (err) {
              reject(err);
            }
            result["upvote"] = rows;
            resolve();
          }
        );
      });

      await Promise.all([registrationPromise, commentPromise, upvotePromise]);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

async function addRegistration(registration) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            INSERT INTO Registrations (userId, eventId, date)
            VALUES (?, ?, ?)
        `,
      [registration.userId, registration.eventId, new Date().toISOString()],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID.toString());
        }
      }
    );
  });
}

async function deleteRegistrationOnId(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM Registrations WHERE ID = ?`, [id], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes.toString());
      }
    });
  });
}

async function getRegistrationsOnEventId(eventId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Registrations.*, Users.nickname, Users.email FROM Registrations INNER JOIN Users ON Registrations.userId = Users.ID WHERE eventId = ? ORDER BY Registrations.date`,
      [eventId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getRegistrationsOnUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Registrations.*, Events.title, Events.start, Events.end FROM Registrations INNER JOIN Events ON Registrations.eventId = Events.ID WHERE userId = ? ORDER BY Events.end DESC`,
      [userId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function addComment(comment) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            INSERT INTO Comments (userId, eventId, added, headline, comment)
            VALUES (?, ?, ?, ?, ?)
        `,
      [
        comment.userId,
        comment.eventId,
        new Date().toISOString(),
        comment.headline,
        comment.comment,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID.toString());
        }
      }
    );
  });
}

async function deleteCommentOnId(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM Comments WHERE ID = ?`, [id], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes.toString());
      }
    });
  });
}

async function updateCommentOnId(id, comment) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            UPDATE Comments
            SET userId = ?, eventId = ?, added = ?, headline = ?, comment = ?
            WHERE ID = ?
        `,
      [
        comment.userId,
        comment.eventId,
        comment.added,
        comment.headline,
        comment.comment,
        id,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes.toString());
        }
      }
    );
  });
}

async function getCommentsOnEventId(eventId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Comments.*, Users.nickname, Users.email FROM Comments INNER JOIN Users ON Comments.userId = Users.ID WHERE eventId = ? ORDER BY Comments.added`,
      [eventId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getCommentsOnUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM Comments WHERE userId = ? ORDER BY Comments.added`,
      [userId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function addUpvote(upvote) {
  return new Promise((resolve, reject) => {
    db.run(
      `
            INSERT INTO Upvotes (userId, eventId, points, date)
            VALUES (?, ?, ?, ?)
        `,
      [upvote.userId, upvote.eventId, upvote.points, new Date().toISOString()],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID.toString());
        }
      }
    );
  });
}

async function deleteUpvoteOnId(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM Upvotes WHERE ID = ?`, [id], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes.toString());
      }
    });
  });
}

async function getUpvotesOnEventId(eventId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Upvotes.*, Users.nickname, Users.email FROM Upvotes INNER JOIN Users ON Upvotes.userId = Users.ID WHERE eventId = ?`,
      [eventId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getUpvotesOnUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Upvotes.*, Events.title FROM Upvotes INNER JOIN Events ON Upvotes.eventId = Events.ID WHERE userId = ?`,
      [userId],
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function conductTextRequest(query) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => {
      if (err) {
        reject(err);
      }
      resolve(rows);
    });
  });
}

async function getUsersWithMostComments() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Users.*, COUNT(Comments.ID) AS commentsCount FROM Users INNER JOIN Comments ON Users.ID = Comments.userId GROUP BY Users.ID ORDER BY commentsCount DESC LIMIT 5`,
      (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getEventsWithMostRegistrations() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Events.*, COUNT(Registrations.ID) AS registrationsCount FROM Events INNER JOIN Registrations ON Events.ID = Registrations.eventId GROUP BY Events.ID ORDER BY registrationsCount DESC LIMIT 5`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

async function getEventsWithBestAverageUpvotes() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT Events.*, AVG(Upvotes.points) AS averageUpvotes FROM Events INNER JOIN Upvotes ON Events.ID = Upvotes.eventId GROUP BY Events.ID ORDER BY averageUpvotes DESC LIMIT 5`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

module.exports = {
  users: {
    checkNicknameOrEmailRegistered,
    checkCorrectLoginCredentials,
    addUser,
    getUserOnId,
    getUserOnEmailNickname,
    updateUserOnId,
    updateUserStatusOnId,
    updateUserLastLoginOnId,
    getInterestedEvents,
    getListeningEvents,
  },
  events: {
    addEvent,
    getEventOnId,
    deleteEventOnId,
    updateEventOnId,
    getEventsOnFilters,
    getAllEvents,
    getListeningUsers,
  },
  registrations: {
    addRegistration,
    deleteRegistrationOnId,
    getRegistrationsOnEventId,
    getRegistrationsOnUserId,
  },
  comments: {
    addComment,
    deleteCommentOnId,
    updateCommentOnId,
    getCommentsOnEventId,
    getCommentsOnUserId,
  },
  upvotes: {
    addUpvote,
    deleteUpvoteOnId,
    getUpvotesOnEventId,
    getUpvotesOnUserId,
  },
  free: {
    conductTextRequest,
  },
  rankings: {
    getUsersWithMostComments,
    getEventsWithMostRegistrations,
    getEventsWithBestAverageUpvotes,
  },
};
