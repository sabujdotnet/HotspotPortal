module.exports = {
  name: "bkash",
  init(app) {
    app.post("/payment/bkash", (req, res) => {
      res.json({ status: "PENDING", provider: "bkash" });
    });
  }
};
