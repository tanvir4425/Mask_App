const bcrypt = require('bcryptjs');
const jwt   = require('jsonwebtoken');
const User  = require('../models/User');

exports.signup = async (req, res) => {
  const { pseudonym, password, email } = req.body;

  // 1) Validate inputs
  if (!pseudonym || !password) {
    return res.status(400).json({ message: 'Pseudonym and password are required.' });
  }

  try {
    // 2) Check if pseudonym already exists
    let existing = await User.findOne({ pseudonym });
    if (existing) {
      return res.status(400).json({ message: 'Pseudonym already taken.' });
    }

    // 3) Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4) Create user
    const user = new User({ pseudonym, passwordHash, email });
    await user.save();

    // 5) Create token
    const token = jwt.sign(
      { userId: user._id, pseudonym: user.pseudonym },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: user._id, pseudonym: user.pseudonym, avatarURL: user.avatarURL } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.login = async (req, res) => {
  const { pseudonym, password } = req.body;

  if (!pseudonym || !password) {
    return res.status(400).json({ message: 'Pseudonym and password are required.' });
  }

  try {
    // 1) Find user
    const user = await User.findOne({ pseudonym });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // 2) Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // 3) Issue token
    const token = jwt.sign(
      { userId: user._id, pseudonym: user.pseudonym },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, pseudonym: user.pseudonym, avatarURL: user.avatarURL } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};
