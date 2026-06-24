import User from "../models/user.model";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


// REGISTER USER
export const register = async (req: any, res: any) => {
  try {

    // kuhaa ang data gikan sa request body
    const { name, email, password, role } = req.body;


    // encrypt ang password para dili plain text sa database
    const hashedPassword = await bcrypt.hash(password, 10);


    // himo ug user record sa MongoDB
    const user = await User.create({
      name, // save ang name
      email, // save ang email
      password: hashedPassword, // encrypted password
      role, // admin, doctor, nurse, staff
    });


    // ipadala balik ang na-create nga user
    res.status(201).json(user);


  } catch (error: any) {

    // kung naay error
    res.status(400).json({
      message: error.message
    });

  }
};



// LOGIN USER
export const login = async (req: any, res: any) => {
  try {

    // kuhaa email ug password gikan sa request
    const { email, password } = req.body;


    // pangitaon ang user gamit ang email
    const user = await User.findOne({ email } as any);


    // kung walay user nga makita
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }


    // icompare ang gi-input nga password ug ang encrypted password sa database
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );


    // kung sayop ang password
    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }


    // himo ug JWT token para ma-authenticate ang user
    const token = jwt.sign(
  {
    id: user._id,
    role: user.role
  },
  process.env.JWT_SECRET || "secretkey",
  {
    expiresIn: (process.env.JWT_EXPIRE || "1d") as any
  }
);

    // ipadala ang token
    res.json({
      token
    });


  } catch (error: any) {

    // server error
    res.status(500).json({
      message: error.message
    });

  }
};