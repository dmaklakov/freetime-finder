var express = require("express");
var bcrypt = require("bcrypt");
var router = express.Router();
var jwt = require("jsonwebtoken");
var db = require("../database");
var dotenv = require("dotenv").config();

const saltRounds = 10;
const jwtSecret = process.env.JWT_SECRET;

// Login endpoint
router.post("/login", async function (req, res) {
  const login = req.body.login;
  const password = req.body.password;
  if (!login || !password) {
    return res
      .status(400)
      .send({ status: "fail", message: "Missing login or password" });
  }

  try {
    const user = await db.users.getUserOnEmailNickname(login);
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign(
        { id: user.ID, email: user.email, status: user.status },
        jwtSecret,
        { expiresIn: "1h" }
      );
      await db.users.updateUserLastLoginOnId(user.ID);

      res.send({
        status: "success",
        message: "Login successful",
        token: token,
        expiresAt: Date.now() + 3600000,
      });
    } else {
      res.status(401).send({ status: "fail", message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).send({ status: "fail", message: "Server error" });
  }
});

// Registration endpoint
router.post("/register", async function (req, res) {
  const nickname = req.body.nickname;
  const email = req.body.email;
  const password = req.body.password;
  if (!email || !password || !nickname) {
    return res.status(400).send({
      status: "fail",
      message: "Missing email, password or nickname!",
    });
  }

  try {
    const userExists = await db.users.checkNicknameOrEmailRegistered(
      nickname,
      email
    );

    if (userExists) {
      res.status(409).send({
        status: "fail",
        message: "User with this email or nickname already exists!",
      });
    } else {
      const hashedPw = await bcrypt.hash(password, saltRounds);
      req.body.password = hashedPw;
      await db.users.addUser(req.body);
      res.send({ status: "success", message: "Registration successful" });
    }
  } catch (error) {
    res.status(500).send({ status: "fail", message: "Server error" });
  }
});

module.exports = router;
