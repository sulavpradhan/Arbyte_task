import { EntityRepository, Repository } from "typeorm";
import { User } from "../Entities/User";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  SendConfirmationEmail,
  sendResetPasswordEmail,
} from "../config/nodemailer.config";
// import dotenv from "dotenv";

// dotenv.config();

@EntityRepository(User)
export class UserRepository extends Repository<User> {
  // Create a new user

  async createUser(req: Request, res: Response) {
    const { firstname, lastname, email, password, username } = req.body;

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    try {
      if (!firstname || !lastname || !email || !username || !password) {
        //   return res.status(400).send({
        //     message: "Please include all fields",
        //   });
        res.status(400);
        throw new Error("Please include all fields");
      }

      const userExists = await User.findOne({ useremail: email });

      if (userExists) {
        res.status(409);
        throw new Error("User already exists");
      }

      let user = new User();
      user.firstname = firstname;
      user.lastname = lastname;
      user.username = username;
      user.useremail = email;
      user.password = hashedPassword;

      // generate confirmation code

      user.confirmation_code = this.generateConfirmationCode(email);

      // Send email for verification

      SendConfirmationEmail(
        user.firstname,
        user.useremail,
        user.confirmation_code
      );
      let userData = await this.save(user);
      return res.status(200).send({
        userData,
        message: "user registered sucessfully ",
      });
    } catch (error: any) {
      res.status(res.statusCode || 503).send({
        message: error.message || "The user could not be registered",
      });
    }
  }

  // Login user

  async loginUser(req: Request, res: Response) {
    const { email, password } = req.body;
    console.log(email, password);

    try {
      const currentUser: any = await User.findOne({ useremail: email });
      console.log(currentUser);
      // check user status before login

      if (currentUser.status != "active") {
        return res.status(401).send({
          message: "Pending Account. Please verify your email",
        });
      }

      if (
        currentUser &&
        (await bcrypt.compare(password, currentUser.password))
      ) {
        const time: string = "3d"; //time for setting expiring time for JWT
        res.status(200).json({
          id: currentUser.id,
          name: currentUser.username,
          email: currentUser.email,
          token: this.generateToken(currentUser.id, time),
          status: currentUser.status,
        });
      } else {
      }
    } catch (error) {
      res.status(404).send({
        message: "user not found",
      });
    }
  }

  // verify user

  async verifyUser(req: Request, res: Response) {
    try {
      // compare the comfirmation code
      const currentUser = await User.findOne({
        confirmation_code: req.params.confirmation_code,
      });

      // if found change the status to active

      if (currentUser) {
        currentUser.status = "active";
        await this.save(currentUser);

        res.status(200).send({
          message: "Account Verified",
        });
      }
    } catch (error) {
      res.send(error);
    }
  }

  // Send Reset password link

  async sendResetLink(req: Request, res: Response) {
    const { email } = req.body;

    const currentUser = await User.findOne({ useremail: email });

    try {
      if (currentUser) {
        // generate password reset token and save it

        const time: string = "1hr"; //time for setting expiring time for JWT
        const resetToken: string = this.generateToken(currentUser.id, time);
        currentUser.resetToken = resetToken;
        this.save(currentUser);

        sendResetPasswordEmail(
          currentUser.firstname,
          currentUser.useremail,
          currentUser.id,
          currentUser.resetToken
        );

        res.status(200).send({
          message: "Please check the email for the reset password link",
        });
      } else {
        res.status(401).send({
          message: "Please enter valid email address",
        });
      }
    } catch (error) {
      res.send(error);
    }
  }

  // Reset password
  // todo: write logic to reset password
  async resetPassword(req: Request, res: Response) {
    console.log("the log is from reset password");
    const id = req.params.id;
    const email = req.query.email;
    const resetToken = req.query.resetToken;
    const { password } = req.body;
    console.log(
      "id:",
      id,
      "\n",
      "resetToken:",
      resetToken,
      "\n",
      "password:",
      password
    );

    const currentUser: any = await User.findOne({ id: id });

    // calculate the time to check the validity of the reset token

    const time = Number(currentUser?.updated_at);
    const d: Date = new Date();
    let currentTime: number = d.getTime();
    let validTime: number = currentTime - time;
    validTime = validTime / (1000 * 60 * 60);
    console.log(validTime);

    // if valid time is less than 1hr and the reset token matches then reset the password after hashing

    if (validTime < 1 && currentUser?.resetToken == resetToken) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      currentUser.password = hashedPassword;
      currentUser.resetToken = null;
      await this.save(currentUser);
      res.status(200).send({
        message: "The password has been reset",
      });
    }
  }

  generateToken = (id: string, time: string) => {
    const key: string = process.env.JWT_KEY!;
    return jwt.sign({ id }, key, {
      expiresIn: time,
    });
  };

  generateConfirmationCode = (email: string) => {
    const key: string = process.env.JWT_KEY!;
    return jwt.sign({ email }, key);
  };
}
