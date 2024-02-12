const express = require("express");
const bodyParser = require("body-parser");
const pg = require("pg");
const axios = require("axios");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "books",
  password: "utkarsh",
  port: 8000,
});

db.connect();

let isLoggedIn = false;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(
  session({
    secret: "johnny johnny yes papa",
    resave: false,
    saveUninitialized: true,
  })
);

async function getBooksRead(userId) {
  const result = await db.query("SELECT * from books_read WHERE user_id = $1", [
    userId,
  ]);
  return result.rows;
}

async function getBookWithGenre(genre) {
  try {
    const result = await axios.get(
      "https://openlibrary.org/subjects/" + genre + ".json"
    );

    const booksOfSpecificGenre = result.data.works.map((work) => ({
      key: work.key,
      title: work.title,
      author_name: work.authors[0].name || "N/A",
      publish_date: work.first_publish_year || "N/A",
      ratings_average: work.average_rating || "N/A",
      cover_id: work.cover_id,
    }));

    return booksOfSpecificGenre;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

app.get("/", async (req, res) => {
  try {
    let booksData;
    let selectedGenre = req.query.selectedGenre || "fantasy";

    if (req.query.selectedGenre) {
      selectedGenre = req.query.selectedGenre;
    }
    booksData = await getBookWithGenre(selectedGenre);
    const placeholder = req.query.placeholder || "Enter book name.";

    res.render("index.ejs", {
      books: booksData,
      placeholder,
      selectedGenre,
      isLoggedIn,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/savedBooks", async (req, res) => {
  try {
    const booksData = await getBooksRead(req.session.user?.id);
    const placeholder = req.query.placeholder || "Enter book name.";
    res.render("savedBooks.ejs", {
      books: booksData,
      placeholder,
      isLoggedIn,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/search", async (req, res) => {
  try {
    const requestedTitle = req.query.query;

    if (!requestedTitle) {
      return res.status(400).json({ error: "Missing search query" });
    }

    const result = await axios.get(
      "https://openlibrary.org/search.json?q=" +
        requestedTitle +
        "&fields=key,title,author_name,publish_date,ratings_average,cover_i"
    );

    const data = result.data.docs[0];
    const existingBook = await db.query(
      "SELECT * FROM books_read WHERE user_id = $1 AND book_id = $2",
      [req.session.user?.id, data.key]
    );

    if (existingBook.rows.length === 0) {
      await db.query(
        "INSERT into books_read(book_id, title, author, publish_date, ratings, cover_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          data.key,
          data.title,
          data.author_name?.[0],
          data.publish_date?.[0],
          data.ratings_average,
          data.cover_i,
          req.session.user?.id,
        ]
      );
      res.redirect("/savedBooks");
    } else {
      res.redirect(
        "/savedBooks?placeholder=Book%20already%20exists.%20Nothing%20was%20inserted."
      );
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error or book not found." });
  }
});

app.post("/delete", async (req, res) => {
  const id = req.body.deleteItemId;
  console.log(id);
  try {
    await db.query("DELETE FROM books_read WHERE id = $1", [id]);
    res.redirect("/savedBooks");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/addToSaved", async (req, res) => {
  try {
    const bookKey = req.body.bookKey;
    const bookTitle = req.body.bookTitle;
    const bookAuthor = req.body.bookAuthor;
    const bookPublishDate = req.body.bookPublishDate;
    const bookRating = req.body.bookRating;
    const bookCoverId = req.body.bookCoverId;

    const existingBook = await db.query(
      "SELECT * FROM books_read WHERE user_id = $1 AND book_id = $2",
      [req.session.user?.id, bookKey]
    );

    if (existingBook.rows.length === 0) {
      await db.query(
        "INSERT INTO books_read(book_id, title, author, publish_date, ratings, cover_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          bookKey,
          bookTitle,
          bookAuthor,
          bookPublishDate,
          parseFloat(bookRating) || 0,
          bookCoverId,
          req.session.user?.id,
        ]
      );
      res.redirect("/savedBooks");
    } else {
      res.redirect(
        "/savedBooks?placeholder=Book%20already%20exists.%20Nothing%20was%20inserted."
      );
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/////////////////////// Handling Authentication Routes ///////////////////////

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.post("/register", async (req, res) => {
  try {
    const fullName = req.body.fullName;
    const email = req.body.email;
    const password = req.body.password;
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (name, email_address, password) VALUES ($1, $2, $3)",
      [fullName, email, hashedPassword]
    );
    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.post("/login", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email_address = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      result.rows[0].password
    );

    if (passwordMatch) {
      req.session.user = {
        id: result.rows[0].id,
        email: result.rows[0].email_address,
      };
      console.log("User in this session:", req.session.user);
      isLoggedIn = true;
      res.redirect("/");
    } else {
      return res.status(401).json({ error: "Incorrect Password" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/logout", (req, res) => {
  isLoggedIn = false;
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`Application is listening on port ${port}`);
});
