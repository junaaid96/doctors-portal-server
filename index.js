const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@jscluster.n9s8s9n.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

async function run() {
    try {
        const appointmentOptionCollection = client
            .db("doctorsPortal")
            .collection("appointmentOptions");
        const bookingsCollection = client
            .db("doctorsPortal")
            .collection("bookings");
        const usersCollection = client.db("doctorsPortal").collection("users");

        // Use Aggregate to query multiple collection and then merge data
        app.get("/appointmentOptions", async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection
                .find(query)
                .toArray();

            // get the bookings of the provided date
            const bookingQuery = { appointmentDate: date };
            const alreadyBooked = await bookingsCollection
                .find(bookingQuery)
                .toArray();

            // code carefully :D
            options.forEach((option) => {
                const optionBooked = alreadyBooked.filter(
                    (book) => book.treatment === option.name
                );
                const bookedSlots = optionBooked.map((book) => book.slot);
                const remainingSlots = option.slots.filter(
                    (slot) => !bookedSlots.includes(slot)
                );
                option.slots = remainingSlots;
            });
            res.send(options);
        });

        app.get("/v2/appointmentOptions", async (req, res) => {
            const date = req.query.date;
            const options = await appointmentOptionCollection
                .aggregate([
                    {
                        $lookup: {
                            from: "bookings",
                            localField: "name",
                            foreignField: "treatment",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ["$appointmentDate", date],
                                        },
                                    },
                                },
                            ],
                            as: "booked",
                        },
                    },
                    {
                        $project: {
                            name: 1,
                            slots: 1,
                            booked: {
                                $map: {
                                    input: "$booked",
                                    as: "book",
                                    in: "$$book.slot",
                                },
                            },
                        },
                    },
                    {
                        $project: {
                            name: 1,
                            slots: {
                                $setDifference: ["$slots", "$booked"],
                            },
                        },
                    },
                ])
                .toArray();
            res.send(options);
        });

        /***
         * API Naming Convention
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings')
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id')
         */

        app.post("/bookings", async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment,
            };

            const alreadyBooked = await bookingsCollection
                .find(query)
                .toArray();

            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        app.get("/bookings", async (req, res) => {
            const query = { email: req.query.email };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const alreadyExists = await usersCollection.find(query).toArray();
            if (alreadyExists.length) {
                const message = `User already exists`;
                return res.send({ acknowledged: false, message });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
    } finally {
    }
}
run().catch(console.log);

app.get("/", async (req, res) => {
    res.send("doctors portal server is running");
});

app.listen(port, () => console.log(`Doctors portal running on ${port}`));
