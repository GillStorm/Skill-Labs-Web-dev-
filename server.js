const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());

// JSON file paths
const MOVIES_FILE = './movies.json';
const BOOKINGS_FILE = './bookings.json';

// Utility functions
async function readJSON(file) {
  return fs.pathExists(file) ? fs.readJSON(file) : [];
}
async function writeJSON(file, data) {
  await fs.writeJSON(file, data, { spaces: 2 });
}
async function ensureFiles() {
  // Sample initial movie data
  if (!(await fs.pathExists(MOVIES_FILE))) {
    await writeJSON(MOVIES_FILE, [
      {
        id: 'm1',
        title: 'Avengers: Endgame',
        duration: 180,
        showtimes: [
          {
            id: 's1',
            time: new Date().toISOString(),
            seats: Array.from({ length: 36 }, (_, i) => ({
              id: 'A' + (i + 1),
              status: 'available'
            }))
          }
        ]
      }
    ]);
  }

  if (!(await fs.pathExists(BOOKINGS_FILE))) {
    await writeJSON(BOOKINGS_FILE, []);
  }
}

//
// 🎞 GET /api/movies
//
app.get('/api/movies', async (req, res) => {
  const movies = await readJSON(MOVIES_FILE);
  res.json(movies);
});

//
// 🎟 GET /api/showtimes/:id/seats
//
app.get('/api/showtimes/:id/seats', async (req, res) => {
  const id = req.params.id;
  const movies = await readJSON(MOVIES_FILE);

  for (const movie of movies) {
    const showtime = movie.showtimes.find(s => s.id === id);
    if (showtime) {
      return res.json({
        movieTitle: movie.title,
        showtimeId: showtime.id,
        time: showtime.time,
        seats: showtime.seats
      });
    }
  }
  res.status(404).json({ error: 'showtime_not_found' });
});

//
// 🪑 POST /api/bookings
//
app.post('/api/bookings', async (req, res) => {
  const { customerName, showtimeId, seats } = req.body;
  if (!customerName || !showtimeId || !Array.isArray(seats))
    return res.status(400).json({ error: 'invalid_request' });

  const movies = await readJSON(MOVIES_FILE);
  const bookings = await readJSON(BOOKINGS_FILE);

  // Find showtime
  let showtime, movie;
  for (const m of movies) {
    const s = m.showtimes.find(x => x.id === showtimeId);
    if (s) {
      showtime = s;
      movie = m;
      break;
    }
  }
  if (!showtime) return res.status(404).json({ error: 'showtime_not_found' });

  // Check availability
  const unavailable = seats.filter(seatId => {
    const seat = showtime.seats.find(x => x.id === seatId);
    return !seat || seat.status !== 'available';
  });
  if (unavailable.length)
    return res.status(409).json({ error: 'seats_unavailable', seats: unavailable });

  // Mark seats as booked
  for (const seatId of seats) {
    const seat = showtime.seats.find(x => x.id === seatId);
    if (seat) seat.status = 'booked';
  }

  // Save booking
  const booking = {
    id: 'b' + Date.now(),
    customerName,
    movieId: movie.id,
    showtimeId,
    seats
  };

  bookings.push(booking);
  await writeJSON(BOOKINGS_FILE, bookings);
  await writeJSON(MOVIES_FILE, movies);

  res.status(201).json({ msg: 'booked', booking });
});

//
// 📋 GET /api/bookings?customer=NAME
//
app.get('/api/bookings', async (req, res) => {
  const q = (req.query.customer || '').toLowerCase();
  const bookings = await readJSON(BOOKINGS_FILE);
  if (!q) return res.json(bookings);
  res.json(bookings.filter(b => (b.customerName || '').toLowerCase().includes(q)));
});

//
// ❌ DELETE /api/bookings/:id
//
app.delete('/api/bookings/:id', async (req, res) => {
  const id = req.params.id;
  const bookings = await readJSON(BOOKINGS_FILE);
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'booking_not_found' });

  const booking = bookings.splice(idx, 1)[0];

  // Free seats
  const movies = await readJSON(MOVIES_FILE);
  const m = movies.find(mm => mm.id === booking.movieId);
  if (m) {
    const s = m.showtimes.find(x => x.id === booking.showtimeId);
    if (s) {
      for (const seatId of booking.seats) {
        const seatObj = s.seats.find(x => x.id === seatId);
        if (seatObj) seatObj.status = 'available';
      }
    }
    await writeJSON(MOVIES_FILE, movies);
  }

  await writeJSON(BOOKINGS_FILE, bookings);
  res.json({ msg: 'canceled', id: booking.id });
});

//
// 🚀 Start server
//
const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  await ensureFiles();
  console.log(`✅ MovieSeat API running on http://localhost:${PORT}`);
});

