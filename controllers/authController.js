const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");

const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "lax",
};

const signAccessToken = (user) =>
  jwt.sign({ id: user._id, tokenVersion: user.refreshTokenVersion }, env.jwtSecret, {
    expiresIn: env.jwtAccessTtl,
  });

const signRefreshToken = (user) =>
  jwt.sign(
    { id: user._id, tokenVersion: user.refreshTokenVersion, type: "refresh" },
    env.jwtSecret,
    { expiresIn: env.jwtRefreshTtl }
  );

const shapeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  collegeId: user.collegeId,
  campusName: user.campusName,
  role: user.role,
});

const signup = async (req, res) => {
  const { name, email, password, phone, campusName, role } = req.body;
  const normalizedEmail = email.toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) throw new ApiError(409, "User already exists");

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      campusName: campusName.trim(),
      role,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      throw new ApiError(409, `${duplicateField} already exists`);
    }
    throw error;
  }
  res.status(201).json({ message: "User created successfully" });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new ApiError(400, "Invalid credentials");

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new ApiError(400, "Invalid credentials");

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  res.cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

  res.json({ token: accessToken, user: shapeUser(user) });
};

const me = async (req, res) => {
  const user = await User.findById(req.user.id).select("-password").lean();
  if (!user) throw new ApiError(404, "User not found");
  res.json({ ...user, id: user._id });
};

const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, "No refresh token provided");
  const decoded = jwt.verify(token, env.jwtSecret);
  if (decoded.type !== "refresh") throw new ApiError(401, "Invalid token type");

  const user = await User.findById(decoded.id);
  if (!user || user.refreshTokenVersion !== decoded.tokenVersion) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const accessToken = signAccessToken(user);
  res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  res.json({ token: accessToken });
};

const logout = async (req, res) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
  res.json({ message: "Logged out successfully" });
};

const logoutAll = async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { $inc: { refreshTokenVersion: 1 } });
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
  res.json({ message: "Logged out from all sessions" });
};

module.exports = { signup, login, me, refresh, logout, logoutAll };
