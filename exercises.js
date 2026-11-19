'use strict';

// Built-in exercise names for the name box's suggestions.
// Type: w = weights (lb × reps), b = bodyweight (reps, no weight), t = timed hold (seconds).
const EXERCISE_LIBRARY = [
  // Chest
  ['Bench Press', 'w'], ['Incline Bench Press', 'w'], ['Decline Bench Press', 'w'], ['Dumbbell Bench Press', 'w'],
  ['Incline Dumbbell Press', 'w'], ['Dumbbell Fly', 'w'], ['Cable Fly', 'w'], ['Pec Deck', 'w'],
  ['Chest Press Machine', 'w'], ['Push-ups', 'b'], ['Incline Push-ups', 'b'], ['Decline Push-ups', 'b'], ['Dips', 'b'],
  // Back
  ['Deadlift', 'w'], ['Romanian Deadlift', 'w'], ['Sumo Deadlift', 'w'], ['Trap Bar Deadlift', 'w'], ['Rack Pull', 'w'],
  ['Barbell Row', 'w'], ['Pendlay Row', 'w'], ['Dumbbell Row', 'w'], ['T-Bar Row', 'w'], ['Seated Cable Row', 'w'],
  ['Machine Row', 'w'], ['Lat Pulldown', 'w'], ['Close-Grip Lat Pulldown', 'w'], ['Straight-Arm Pulldown', 'w'],
  ['Pull-ups', 'b'], ['Chin-ups', 'b'], ['Assisted Pull-up', 'w'], ['Inverted Row', 'b'], ['Face Pull', 'w'],
  ['Back Extension', 'b'], ['Barbell Shrug', 'w'], ['Dumbbell Shrug', 'w'],
  // Shoulders
  ['Overhead Press', 'w'], ['Dumbbell Shoulder Press', 'w'], ['Arnold Press', 'w'], ['Shoulder Press Machine', 'w'],
  ['Lateral Raise', 'w'], ['Cable Lateral Raise', 'w'], ['Front Raise', 'w'], ['Rear Delt Fly', 'w'],
  ['Reverse Pec Deck', 'w'], ['Upright Row', 'w'], ['Pike Push-ups', 'b'], ['Handstand Hold', 't'],
  // Arms
  ['Bicep Curl', 'w'], ['Barbell Curl', 'w'], ['Dumbbell Curl', 'w'], ['EZ-Bar Curl', 'w'], ['Hammer Curl', 'w'],
  ['Preacher Curl', 'w'], ['Cable Curl', 'w'], ['Concentration Curl', 'w'], ['Incline Dumbbell Curl', 'w'],
  ['Reverse Curl', 'w'], ['Wrist Curl', 'w'], ['Tricep Pushdown', 'w'], ['Rope Pushdown', 'w'],
  ['Overhead Tricep Extension', 'w'], ['Skull Crushers', 'w'], ['Close-Grip Bench Press', 'w'],
  ['Tricep Kickback', 'w'], ['Tricep Dips', 'b'], ['Diamond Push-ups', 'b'],
  // Legs
  ['Squat', 'w'], ['Back Squat', 'w'], ['Front Squat', 'w'], ['Goblet Squat', 'w'], ['Hack Squat', 'w'],
  ['Smith Machine Squat', 'w'], ['Leg Press', 'w'], ['Bulgarian Split Squat', 'w'], ['Lunges', 'w'],
  ['Walking Lunges', 'w'], ['Reverse Lunges', 'w'], ['Step-ups', 'w'], ['Leg Extension', 'w'], ['Leg Curl', 'w'],
  ['Seated Leg Curl', 'w'], ['Lying Leg Curl', 'w'], ['Hip Thrust', 'w'], ['Glute Bridge', 'b'], ['Good Morning', 'w'],
  ['Calf Raise', 'w'], ['Seated Calf Raise', 'w'], ['Hip Abduction', 'w'], ['Hip Adduction', 'w'],
  ['Cable Kickback', 'w'], ['Bodyweight Squat', 'b'], ['Jump Squats', 'b'], ['Pistol Squat', 'b'],
  ['Box Jumps', 'b'], ['Wall Sit', 't'],
  // Core
  ['Plank', 't'], ['Side Plank', 't'], ['Hollow Hold', 't'], ['L-Sit', 't'], ['Crunches', 'b'], ['Sit-ups', 'b'],
  ['Bicycle Crunches', 'b'], ['Cable Crunch', 'w'], ['Hanging Leg Raise', 'b'], ['Leg Raises', 'b'],
  ['Toes to Bar', 'b'], ['V-ups', 'b'], ['Russian Twist', 'b'], ['Ab Wheel Rollout', 'b'], ['Dead Bug', 'b'],
  ['Flutter Kicks', 'b'], ['Mountain Climbers', 'b'], ['Pallof Press', 'w'], ['Woodchopper', 'w'],
  // Full body and conditioning
  ['Burpees', 'b'], ['Kettlebell Swing', 'w'], ['Clean and Press', 'w'], ['Power Clean', 'w'], ['Snatch', 'w'],
  ['Thrusters', 'w'], ['Farmer\'s Carry', 't'], ['Sled Push', 'w'], ['Battle Ropes', 't'], ['Jump Rope', 't'],
  ['Bear Crawl', 't'],
];
