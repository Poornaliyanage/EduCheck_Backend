require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise"); // Use promise-based MySQL2
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
//const { OAuth2Client } = require('google-auth-library');
//const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const db = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

(async () => {
    try {
        const connection = await db.getConnection();
        connection.release();
        console.log('Connected to database');
    } catch (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
})();

// New registration
// app.post("/register", async (req, res) => {
//     const { name, email, password } = req.body;

//     if (!name || !email || !password) {
//         return res.status(400).json({ 
//             message: "Please provide all required fields: name, email, and password" 
//         });
//     }

//     try {
//         const [existingUser] = await db.query(
//             "SELECT * FROM user WHERE email = ?", 
//             [email]
//         );

//         if (existingUser.length > 0) {
//             return res.status(409).json({ 
//                 message: "User with this email already exists" 
//             });
//         }

//         // password hashing
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);

//         // new user default as a student and local authentication
//         const [result] = await db.query(
//             `INSERT INTO user (
//                 user_name, 
//                 email, 
//                 password, 
//                 role_id, 
//                 auth_provider, 
//                 auth_id
//             ) VALUES (?, ?, ?, ?, ?, ?)`,
//             [
//                 name,
//                 email,
//                 hashedPassword,
//                 50, //role_id
//                 'local', //default auth_provider
//                 null //auth_id will be null
//             ]
//         );

//         //generate JWT token for automatic login after registration
//         const token = jwt.sign(
//             { 
//                 user_id: result.insertId,
//                 role_id: 1
//             },
//             process.env.JWT_SECRET,
//             { expiresIn: "1h" }
//         );

//         res.status(201).json({
//             message: "User registered successfully",
//             token,
//             user: {
//                 id: result.insertId,
//                 name,
//                 email,
//                 role_id: 1
//             }
//         });

//     } catch (error) {
//         console.error('Registration error:', error);
//         res.status(500).json({ 
//             message: "Error registering user",
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// });

// Updated registration route
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ 
            message: "Please provide all required fields: name, email, and password" 
        });
    }

    try {
        const [existingUser] = await db.query(
            "SELECT * FROM user WHERE email = ?", 
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({ 
                message: "User with this email already exists" 
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await db.query(
            `INSERT INTO user (
                user_name, 
                email, 
                password, 
                role_id, 
                auth_provider, 
                auth_id
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                name,
                email,
                hashedPassword,
                50, // role_id for student
                'local',
                null
            ]
        );

        // Create token with consistent user data
        const token = jwt.sign(
            { 
                user_id: result.insertId,
                user_name: name,
                email: email,
                role_id: 50
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Send back user data matching frontend expectations
        res.status(201).json({
            message: "User registered successfully",
            token,
            user: {
                id: result.insertId,
                name,
                email,
                role_id: 50
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            message: "Error registering user",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const [user] = await db.query("SELECT * FROM user WHERE email = ?", [email]);

        if (!user || user.length === 0) {
            return res.status(400).json({ message: "User not found" });
        }

        const validPassword = await bcrypt.compare(password, user[0].password);
        if (!validPassword) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Generate JWT token
        const token = jwt.sign(
            { user_id: user[0].user_id, role_id: user[0].role_id, user_name: user[0].user_name },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Send token AND user_name in the response
        res.status(200).json({ 
            message: "Login successful", 
            token, 
            user_name: user[0].user_name 
        });

    } catch (error) {
        res.status(500).json({ message: "Error logging in" });
    }
});

app.get("/classes", async (req, res) => {
    try {
        const [results] = await db.query("SELECT * FROM classes");
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/get-class-id", async (req, res) => {
    const { random_code } = req.body;
    try {
        const [results] = await db.query("SELECT class_id FROM classes WHERE random_code = ?", [random_code]);

        if (results.length === 0) {
            return res.status(404).json({ error: "Class not found" });
        }

        res.json({ class_id: results[0].class_id });
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// app.post("/mark-attendance", async (req, res) => {
//     const { class_id, reg_no } = req.body;

//     if (!class_id || !reg_no) {
//         return res.status(400).json({ error: "Class ID and Registration Number are required" });
//     }

//     try {
//         const [existing] = await db.query("SELECT * FROM attendance WHERE class_id = ? AND reg_no = ?", [class_id, reg_no]);

//         if (existing.length > 0) {
//             return res.status(409).json({ error: "Attendance already marked for this student" });
//         }
//         const [result] = await db.query(
//             "INSERT INTO attendance (class_id, reg_no, attended_at) VALUES (?, ?, NOW())",
//             [class_id, reg_no]
//         );
//         const [commentResults] = await db.query(
//             `SELECT comment_1, comment_2 
//              FROM comment_table 
//              WHERE reg_no = ? AND csv_id IN 
//              (SELECT csv_id FROM csv_table WHERE class_id = ?)`,
//             [reg_no, class_id]
//         );

//         const comments = commentResults.length > 0 ? commentResults[0] : { comment_1: null, comment_2: null };

//         res.status(201).json({
//             success: true,
//             message: "Attendance marked successfully",
//             attendance_id: result.insertId,
//             comment_1: comments.comment_1,
//             comment_2: comments.comment_2
//         });
//     } catch (err) {
//         res.status(500).json({ error: "Failed to mark attendance" });
//     }
// });

// app.post("/mark-attendance", async (req, res) => {
//     const { class_id, reg_no } = req.body;

//     if (!class_id || !reg_no) {
//         return res.status(400).json({ error: "Class ID and Registration Number are required" });
//     }

//     try {
//         // Get comments regardless of attendance status
//         const [commentResults] = await db.query(
//             `SELECT comment_1, comment_2 
//              FROM comment_table 
//              WHERE reg_no = ? AND csv_id IN 
//              (SELECT csv_id FROM csv_table WHERE class_id = ?)`,
//             [reg_no, class_id]
//         );

//         const comments = commentResults.length > 0 ? commentResults[0] : { comment_1: null, comment_2: null };

//         // Check for existing attendance
//         const [existing] = await db.query(
//             "SELECT attended_at FROM attendance WHERE class_id = ? AND reg_no = ?", 
//             [class_id, reg_no]
//         );

//         if (existing.length > 0) {
//             return res.status(409).json({ 
//                 error: "Attendance already marked for this student",
//                 attended_at: existing[0].attended_at,
//                 comment_1: comments.comment_1,
//                 comment_2: comments.comment_2
//             });
//         }

//         // Mark new attendance
//         const [result] = await db.query(
//             "INSERT INTO attendance (class_id, reg_no, attended_at) VALUES (?, ?, NOW())",
//             [class_id, reg_no]
//         );

//         res.status(201).json({
//             success: true,
//             message: "Attendance marked successfully",
//             attendance_id: result.insertId,
//             comment_1: comments.comment_1,
//             comment_2: comments.comment_2
//         });
//     } catch (err) {
//         console.error("Error marking attendance:", err);
//         res.status(500).json({ error: "Failed to mark attendance" });
//     }
// });

app.post("/mark-attendance", async (req, res) => {
    const { class_id, reg_no, device_time } = req.body;

    if (!class_id || !reg_no || !device_time) {
        return res.status(400).json({ error: "Class ID, Registration Number, and Device Time are required" });
    }

    try {
        // Get comments regardless of attendance status
        const [commentResults] = await db.query(
            `SELECT comment_1, comment_2 
             FROM comment_table 
             WHERE reg_no = ? AND csv_id IN 
             (SELECT csv_id FROM csv_table WHERE class_id = ?)`,
            [reg_no, class_id]
        );

        const comments = commentResults.length > 0 ? commentResults[0] : { comment_1: null, comment_2: null };

        // Check for existing attendance
        const [existing] = await db.query(
            "SELECT attended_at FROM attendance WHERE class_id = ? AND reg_no = ?", 
            [class_id, reg_no]
        );

        if (existing.length > 0) {
            return res.status(409).json({ 
                error: "Attendance already marked for this student",
                attended_at: existing[0].attended_at,
                comment_1: comments.comment_1,
                comment_2: comments.comment_2
            });
        }

        // Mark new attendance using device time
        const [result] = await db.query(
            "INSERT INTO attendance (class_id, reg_no, attended_at) VALUES (?, ?, ?)",
            [class_id, reg_no, device_time]
        );

        res.status(201).json({
            success: true,
            message: "Attendance marked successfully",
            attendance_id: result.insertId,
            attended_at: device_time,
            comment_1: comments.comment_1,
            comment_2: comments.comment_2
        });
    } catch (err) {
        console.error("Error marking attendance:", err);
        res.status(500).json({ error: "Failed to mark attendance" });
    }
});

app.get("/attendance/:random_code", async (req, res) => {
    const { random_code } = req.params;

    try {
        const [classResult] = await db.query(
            "SELECT class_id, subject_code, scheduled_time, venue FROM classes WHERE random_code = ?", 
            [random_code]
        );

        if (!classResult || classResult.length === 0) {
            return res.status(404).json({ message: "Class not found for the given random code" });
        }

        const { class_id, subject_code, scheduled_time, venue } = classResult[0];

        // Fetch attendance records linked to the class_id
        const [attendanceRecords] = await db.query(
            "SELECT reg_no FROM attendance WHERE class_id = ?", 
            [class_id]
        );

        // Prepare response
        res.status(200).json({
            reg_nos: attendanceRecords.map(record => record.reg_no),
            class_details: {
                subject_code,
                scheduled_time,
                venue
            }
        });

    } catch (error) {
        console.error("Error fetching attendance:", error);
        res.status(500).json({ message: "Error fetching attendance records" });
    }
});


app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
