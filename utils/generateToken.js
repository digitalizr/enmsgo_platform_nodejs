import jwt  from "jsonwebtoken"

const generateToken = async (userId) => {
  try {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });
    return token;

  } catch (error) {
    console.log("Error while creating the token : ", error);
    throw new Error("Error while creating the token");
  }
};
export default generateToken;
