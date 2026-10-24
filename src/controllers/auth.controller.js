import {
  getUserById,
  loginUser,
  registerUser,
} from "../services/auth.service.js";

export async function registerController(req, res, next) {
  try {
    res.status(201).json({ success: true, data: await registerUser(req.body) });
  } catch (error) {
    next(error);
  }
}

export async function loginController(req, res, next) {
  try {
    res.status(200).json({ success: true, data: await loginUser(req.body) });
  } catch (error) {
    next(error);
  }
}

export async function meController(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      data: { user: await getUserById(req.user.id) },
    });
  } catch (error) {
    next(error);
  }
}
