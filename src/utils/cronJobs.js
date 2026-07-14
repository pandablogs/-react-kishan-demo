import Attempt from "../models/Attempt.js";
import Badge from "../models/Badge.js";
import cron from "node-cron";

export const calculateLeaderboardAndAwardBadges = async (timeframe) => {
  try {
    const now = new Date();
    const matchStage = {};
    let periodKey = "";
    
    if (timeframe === "weekly") {
      // Awarding for the *previous* week. 
      // So the start date is Last week's Monday 5:30 AM
      // End date is Today's Monday 5:30 AM
      const currentMonday = new Date(now);
      const day = currentMonday.getDay();
      const daysSinceMonday = (day + 6) % 7;
      currentMonday.setDate(currentMonday.getDate() - daysSinceMonday);
      currentMonday.setHours(5, 30, 0, 0);
      
      const lastMonday = new Date(currentMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      
      matchStage.createdAt = { $gte: lastMonday, $lt: currentMonday };
      
      const year = lastMonday.getFullYear();
      const firstDayOfYear = new Date(year, 0, 1);
      const pastDaysOfYear = (lastMonday.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      periodKey = `weekly-${year}-W${weekNum}`;
      
    } else if (timeframe === "monthly") {
      // Previous month
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 5, 30, 0, 0);
      const lastMonthStart = new Date(currentMonthStart);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
      
      matchStage.createdAt = { $gte: lastMonthStart, $lt: currentMonthStart };
      
      periodKey = `monthly-${lastMonthStart.getFullYear()}-${(lastMonthStart.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    // Check if badges already awarded for this period
    const existing = await Badge.findOne({ periodKey });
    if (existing) {
      console.log(`Badges already awarded for ${periodKey}`);
      return;
    }

    const leaderboard = await Attempt.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: "$userDetails" },
      { $match: { "userDetails.role": "student" } },
      {
        $group: {
          _id: "$studentId",
          totalPoints: { $sum: "$score" },
          examsTaken: { $sum: 1 },
          totalPercentage: {
            $sum: {
              $cond: [
                { $gt: ["$totalMarks", 0] },
                { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] },
                0
              ]
            }
          },
          totalTimeTaken: { $sum: "$timeTaken" },
        },
      },
      {
        $addFields: {
          totalPoints: { $round: ["$totalPoints", 0] },
          avgScore: {
            $round: [{ $divide: ["$totalPercentage", "$examsTaken"] }, 0]
          },
        }
      },
      { $sort: { totalPoints: -1, avgScore: -1, totalTimeTaken: 1 } },
      { $limit: 3 }, // Only need top 3 for badges
    ]);

    if (!leaderboard || leaderboard.length === 0) return;

    // Award Top 3
    const types = ["gold", "silver", "bronze"];
    for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
      try {
        await Badge.create({
          studentId: leaderboard[i]._id,
          type: types[i],
          category: timeframe,
          periodKey,
          earnedAt: now
        });
      } catch (err) {
        // Duplicate key or other error, skip
      }
    }
    console.log(`Awarded badges for ${periodKey}`);
  } catch (error) {
    console.error("Error calculating leaderboard and awarding badges:", error);
  }
};

/**
 * Checks if badges for the current pending periods (last week/month) 
 * have been awarded. If not, awards them.
 */
const checkAndAwardMissingBadges = async () => {
  console.log("Checking for missing badge awards on startup...");
  try {
    // Check weekly
    await calculateLeaderboardAndAwardBadges("weekly");
    // Check monthly
    await calculateLeaderboardAndAwardBadges("monthly");
  } catch (err) {
    console.error("Error during startup badge check:", err);
  }
};

export const initCronJobs = () => {
  // Check on startup in case server was down during the cron window
  checkAndAwardMissingBadges();

  // Run every Monday at 5:30 AM IST
  cron.schedule("30 5 * * 1", () => {
    console.log("Running weekly badge awarding job...");
    calculateLeaderboardAndAwardBadges("weekly");
  }, {
    timezone: "Asia/Kolkata"
  });

  // Run on the 1st of every month at 5:30 AM IST
  cron.schedule("30 5 1 * *", () => {
    console.log("Running monthly badge awarding job...");
    calculateLeaderboardAndAwardBadges("monthly");
  }, {
    timezone: "Asia/Kolkata"
  });
};
