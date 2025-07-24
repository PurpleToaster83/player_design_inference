// Get a reference to the database service
const root = firebase.database().ref();
const resultsRef = root.child("results");
const counterRef = root.child("counter");
const counterKey = "count";
let count = 0;

var experimentApp = angular.module(
  'experimentApp', ['ngSanitize', 'preloader'],
  function($locationProvider) {
    $locationProvider.html5Mode({enabled: true, requireBase: false});
  }
);
var start_time;

experimentApp.controller('ExperimentController',
  function ExperimentController($scope, $timeout, $location, preloader) {
    $scope.user_id = Date.now();

    $scope.section = "instructions";
    $scope.inst_id = 0;
    $scope.stim_id = 0;
    $scope.part_id = -1;

    $scope.valid_comprehension = false;
    $scope.comprehension_response = "";

    $scope.response = {
      "beliefs": [NaN, NaN],
      "belief_ids": [1, 2]
    };

    $scope.valid_belief = false;

    $scope.valid_exam = false;
    $scope.exam_score = 0;
    $scope.exam_results = [];
    $scope.exam_done = false;
    $scope.last_exam_correct = false;
    $scope.last_exam_response = "";

    $scope.show_rhs = true;

    $scope.belief_statements = [];
    $scope.belief_statement_ids = [];
    $scope.belief_statement_counts = [];
    $scope.n_displayed_statements = 4;

    $scope.ratings = [];

    $scope.replaying = false;
    $scope.replay_id = 0;

    $scope.user_count = 0;
    $scope.div = document.getElementById('ground_truth');
    $scope.total_reward = 0;
    $scope.total_payment = 0;
    $scope.stim_reward = 0;

    $scope.log = function(...args) {
      if ($location.search().debug == "true") {
        console.log(...args);
      }
    }

    $scope.store_to_db = function(key, val) {
      $scope.log("Storing " + key + " with " + JSON.stringify(val));
      resultsRef.child(key).set(val);
    }

    $scope.get_counter = async function () {
      return counterRef.child(counterKey).once("value", function (snapshot) {
        $scope.user_count = snapshot.val();
      }).then(() => { return $scope.user_count; });
    }
    
    $scope.increment_counter = function() {
      counterRef.child(counterKey).set($scope.user_count + 1);
    }

    $scope.get_statement_counts = async function (stim_id) {
      let cur_stim = $scope.stimuli_set[stim_id];
      let n = cur_stim.statements.length;
      if ($location.search().local == "true") {
        $scope.belief_statement_counts = Array(n).fill(0);
        return $scope.belief_statement_counts;
      } else {
        let key = "statement_counts/" + cur_stim.name;
        return counterRef.child(key).once("value", function (snapshot) {
          let data = snapshot.val();
          if (!data) {
            $scope.belief_statement_counts = Array(n).fill(0);
          } else {
            $scope.belief_statement_counts = data;
          }
        }).then(() => { return $scope.belief_statement_counts; });
      }
    }
    
    $scope.set_statement_counts = function(stim_id, counts) {
      if ($location.search().local == "true") {
        return;
      } else {
        let cur_stim = $scope.stimuli_set[stim_id];
        let key = "statement_counts/" + cur_stim.name;
        counterRef.child(key).set(counts);
      }
    }

    $scope.validate_answer = function (ans) {
      $scope.comprehension_response = ans;
      let index = $scope.instructions[$scope.inst_id].answer;
      $scope.valid_comprehension = ans == $scope.instructions[$scope.inst_id].options[index];
    }

    $scope.validate_belief = function () {
      $scope.valid_belief = $scope.response.beliefs.every(rating => !isNaN(rating));
    }

    $scope.validate_exam = function (ans) {
      $scope.exam_response = ans;
      $scope.valid_exam = true;
    }
    
    $scope.set_belief_statements = async function (stim_id) {
      let cur_stim = $scope.stimuli_set[stim_id];
      $scope.n_displayed_statements = cur_stim.statements.length;

      let n = cur_stim.statements.length;
      let ids = Array.from(Array(n).keys());
      $scope.belief_statement_ids =
      $scope.array_sample(ids, $scope.n_displayed_statements);
      
      $scope.belief_statements =
        $scope.belief_statement_ids.map(id => cur_stim.statements[id]);
      $scope.log("Belief statement IDs: " + $scope.belief_statement_ids);
      $scope.log("Belief statements: " + $scope.belief_statements);
    }

    $scope.reset_response = function () {
      $scope.response = {
        "beliefs": Array($scope.belief_statements.length).fill(NaN),
        "belief_ids": $scope.belief_statement_ids
      };
    }

    $scope.advance = async function () {
      if ($scope.section == "instructions") {
        await $scope.advance_instructions()
      } else if ($scope.section == "stimuli") {
        await $scope.advance_stimuli()
      } else if ($scope.section == "endscreen") {
        $scope.end_id += 1;
        if ($scope.end_id == 2) {
          $scope.age_q = document.getElementById("age");
          $scope.gender_q = document.getElementById("gender");
          $scope.ethnicity_q = document.getElementById("ethnicity");
          $scope.id_q = document.getElementById("mturkID");
          $scope.feedback_q = document.getElementById("feedback");

          $scope.survey = {
            age: $scope.age_q.value,
            gender: $scope.gender_q.value,
            ethnicity: $scope.ethnicity_q.value,
            mturk_id: $scope.id_q.value,
            feedback: $scope.feedback_q.value
          }
          $scope.store_to_db($scope.user_id + "/demographic_survey", $scope.survey);
        }
      }
    };
    
    $scope.advance_instructions = async function () {
      if ($scope.inst_id == $scope.instructions.length - 1) {
        // Initialize stimuli section
        $scope.section = "stimuli";
        $scope.stim_id = 0;
        $scope.part_id = 0;
        $scope.ratings = [];
        await $scope.set_belief_statements($scope.stim_id);
        // Get time of first stimulus
        if (start_time == undefined) {
          start_time = (new Date()).getTime();
        }
      } else if ($scope.instructions[$scope.inst_id].exam_end) {
        // Store exam results for initial attempt
        if (!$scope.exam_done) {
          let exam_data = {
            "results": $scope.exam_results,
            "score": $scope.exam_score
          }
          $scope.log("Exam Results: " + exam_data.results);
          $scope.log("Exam Score: " + exam_data.score);
          $scope.store_to_db($scope.user_id + "/exam", exam_data);
          $scope.exam_done = true;
        }
        // Loop back to start of exam if not all questions are correct
        if ($scope.exam_score < $scope.exam_results.length) {
          $scope.inst_id = $scope.instructions[$scope.inst_id].exam_start_id;
        } else {
          $scope.inst_id = $scope.inst_id + 1;
        }
        $scope.exam_results = [];
        $scope.exam_score = 0;
      } else {
        // Score exam question
        if ($scope.instructions[$scope.inst_id].exam) {
          let ans = $scope.instructions[$scope.inst_id].options[$scope.instructions[$scope.inst_id].answer];
          let correct = ans === $scope.exam_response;
          $scope.exam_results.push(correct);
          $scope.exam_score = $scope.exam_results.filter(correct => correct == true).length
          $scope.last_exam_correct = correct;
          $scope.last_exam_response = $scope.exam_response;
        }
        // Increment instruction counter
        $scope.inst_id = $scope.inst_id + 1;
        // Delay RHS display
        if ($scope.instructions[$scope.inst_id].delay > 0) {
          $scope.show_rhs = false;
          $timeout(function() {$scope.show_rhs = true;},
                   $scope.instructions[$scope.inst_id].delay);
        }
        // Set new belief statements
        if ($scope.has_belief_question()) {
          $scope.belief_statements = $scope.instructions[$scope.inst_id].statements;
          let n = $scope.belief_statements.length;
          $scope.belief_statement_ids = Array.from(Array(n).keys());
        }
      }

      $scope.div = document.getElementById('ground_truth')
      if ($scope.inst_id == 3) {
        $scope.div.innerHTML = "<br>Number of Potions: " + $scope.instructions[$scope.inst_id].numPotions + "<br><br>Number of Poisons: " + $scope.instructions[$scope.inst_id].numPoisons + "<br><br>";
      }
      else if ($scope.inst_id == 4) {
          $scope.div.innerHTML = "";
          $scope.div.innerHTML += "<u>Here are the types of liquid in each flask:</u>" + "<br><br>";
          $scope.instructions[$scope.inst_id].ground_truth.forEach((element) => {
              $scope.div.innerHTML += element + "<br>";
          });
      }
      
      $scope.reset_response();
      $scope.valid_belief = false;
      $scope.comprehension_response = "";
      $scope.valid_comprehension = false;
      $scope.exam_response = "";
      $scope.valid_exam = false;
    };

    $scope.advance_stimuli = async function () {
      if ($scope.stim_id == $scope.stimuli_set.length) {
        // Advance to endscreen
        $scope.section = "endscreen"
        $scope.end_id = 0; 
        $scope.total_payment = ($scope.total_reward > 0) ? $scope.total_reward / 100 : 0;
        $scope.store_to_db($scope.user_id + "/total_reward", $scope.total_reward);
        $scope.store_to_db($scope.user_id + "/total_payment", $scope.total_payment);
      }  else if ($scope.part_id < 0) {
        // Advance to first part
        $scope.part_id = $scope.part_id + 1;
        $scope.ratings = [];
        await $scope.set_belief_statements($scope.stim_id);
        start_time = (new Date()).getTime();
      } else if ($scope.part_id < $scope.stimuli_set[$scope.stim_id].length) {
        // Advance to next part
        if ($scope.part_id > 0) {
          var step_ratings = $scope.compute_ratings($scope.response);
          $scope.ratings.push(step_ratings);
          $scope.log(step_ratings);
          $scope.calc_stim_reward($scope.response);
          $scope.total_reward += $scope.stim_reward;
          $scope.div.innerHTML = "";
          $scope.div.innerHTML += "<u>Here are the types of liquid in each flask:</u>" + "<br><br>";
          $scope.stimuli_set[$scope.stim_id].ground_truth.forEach((element) => {
              $scope.div.innerHTML += element + "<br>";
          });
        }
        if ($scope.part_id == 0) {
          $scope.div.innerHTML = "";
          $scope.div.innerHTML += "<br>Number of Potions: " + $scope.stimuli_set[$scope.stim_id].numPotions + "<br><br>Number of Poisons: " + $scope.stimuli_set[$scope.stim_id].numPoisons + "<br><br>";
        }
        $scope.part_id = $scope.part_id + 1;
        if ($scope.part_id == $scope.stimuli_set[$scope.stim_id].length) {
          // Store ratings
          $scope.store_to_db($scope.user_id + "/" + $scope.stimuli_set[$scope.stim_id].name, $scope.ratings);
          // Advance to next problem.
          $scope.part_id = -1;
          $scope.stim_id = $scope.stim_id + 1;
          if ($scope.stim_id < $scope.stimuli_set.length) {
            preloader.preloadImages($scope.stimuli_set[$scope.stim_id].images).then(
              function handleResolve(imglocs) { console.info("Preloaded next stimulus."); });
          }
        }
      }
      $scope.reset_response();
      $scope.valid_belief = false;
    };

    $scope.compute_ratings = function (response) {
      let cur_stim = $scope.stimuli_set[$scope.stim_id];
      // Create array of belief ratings for every statement
      let n_ratings = cur_stim.statements.length;
      let statement_ratings = Array(n_ratings).fill(-1);
      response.beliefs.forEach((rating, index) => {
        statement_ratings[$scope.belief_statement_ids[index]] = rating;
      });

      // Normalize belief ratings
      let min_rating = 1;
      let max_rating = 7;
      let statement_probs = statement_ratings.map(
        (x) => x > 0 ? (x-min_rating)/(max_rating-min_rating) : x
      );

      rating = {
        "timestep": cur_stim.times[$scope.part_id],
        "time_spent": ((new Date()).getTime() - start_time) / 1000.,
        "statement_ratings": statement_ratings,
        "statement_probs": statement_probs,
        "statement_ids": response.belief_ids.map(v => v+1),
      }
      return rating;
    };

    $scope.style_statement = function (stmt) {
      return stmt
    }

    $scope.rating_text = [
      "Definitely<br>Poison",
      "",
      "",
      "Even<br>Chance",
      "",
      "",
      "Definitely<br>Potion",
    ];

    $scope.instruction_has_text = function () {
      return $scope.instructions[$scope.inst_id].text != null
    };
    $scope.instruction_has_image = function () {
      return $scope.instructions[$scope.inst_id].image != null
    };
    $scope.instruction_has_question = function () {
      return $scope.instructions[$scope.inst_id].question != null
    };
    $scope.is_exam = function () {
      return $scope.instructions[$scope.inst_id].exam == true
    };
    $scope.is_feedback = function () {
      return $scope.instructions[$scope.inst_id].feedback == true
    };
    $scope.is_exam_end = function () {
      return $scope.instructions[$scope.inst_id].exam_end == true
    };
    $scope.is_tutorial = function () {
      return $scope.instructions[$scope.inst_id].tutorial == true
    };
    $scope.hide_questions = function () {
      if ($scope.section == "stimuli") {
        return $scope.part_id < 0
      } else if ($scope.section == "instructions") {
        return $scope.instructions[$scope.inst_id].show_questions == false
      }
      return true
    };

    $scope.has_belief_question = function () {
      if ($scope.section == "stimuli") {
        return $scope.part_id > 0
      } else if ($scope.section == "instructions") {
        return ($scope.instructions[$scope.inst_id].question_types != null &&
                $scope.instructions[$scope.inst_id].question_types.includes("beliefs") )
      }
      return false
    };

    $scope.cur_stim_image = function () {
      if ($scope.section != "stimuli" || $scope.stim_id < 0) {
        return "stimuli/segments/tutorial.png"
      } else if ($scope.part_id < 0) {
        return $scope.stimuli_set[$scope.stim_id-1].images.slice(-1)[0]
      } else if ($scope.replaying) {
        let stim = $scope.stimuli_set[$scope.stim_id];
        return stim.images[$scope.replay_id];
      } else {
        let stim = $scope.stimuli_set[$scope.stim_id];
        return stim.images[$scope.part_id];
      }
    };

    $scope.array_equals = function (a, b) {
      return Array.isArray(a) &&
          Array.isArray(b) &&
          a.length === b.length &&
          a.every((val, index) => val === b[index]);
    }

    $scope.array_shuffle = function (arr) {
        return arr.map(a => [a, Math.random()])
          .sort((a, b) => { return a[1] < b[1] ? -1 : 1; }).map(a => a[0]);
    }

    $scope.array_sample = function(arr, n) {
      return arr.slice(0, n); 
    }

    $scope.stimuli_set = [];
    $scope.set_stimuli = async function () {
      // Uncomment for testing stimuli
      let stim_idx = [];
      if ($location.search().test_all == "true") {
        stim_idx = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
                    11, 12, 13, 14, 15, 16, 17, 18];
      } else {
        let count = await $scope.get_counter();
        stim_idx = $scope.stimuli_sets[count % $scope.stimuli_sets.length];  
      }

      $scope.log("stimuli idx = " , stim_idx);
      for (i = 0; i < stim_idx.length; i++) {
        $scope.stimuli_set.push($scope.stimuli[stim_idx[i] - 1]);
      }
      $scope.stimuli_set = $scope.array_shuffle($scope.stimuli_set);
      $scope.log("stimuli ", $scope.stimuli_set);

      // Store stimuli set and user ID
      $scope.store_to_db($scope.user_id + "/stimuli_set", stim_idx);
      $scope.store_to_db($scope.user_id + "/user_id", $scope.user_id);

      // Increment participant counter
      if ($location.search().test_all != "true") {
        $scope.increment_counter();
      }

      // Preload first stimulus
      preloader.preloadImages($scope.stimuli_set[0].images).then(
        function handleResolve(imglocs) {
          console.info("Preloaded first stimulus.");
        }
      );
    };

    $scope.calc_stim_reward = function (response) {
      $scope.stim_reward = 0;

      response.beliefs.forEach((belief, index) => {
        const liquid_type = $scope.stimuli_set[$scope.stim_id].ground_truth[index].substring(7);
        if (liquid_type == "Potion") {
          $scope.diff = 7 - belief;
        }
        else {
          $scope.diff = belief - 1;
        }
        $scope.stim_reward += (-1 * $scope.diff) + 3;
      });
    }

    $scope.stimuli_sets = [
      [1, 4, 7, 12, 14, 18, 19, 22, 27, 30],
      [2, 6, 8, 11, 13, 17, 20, 23, 25, 29],
      [3, 5, 9, 10, 15, 16, 21, 24, 26, 28]
    ]

    $scope.stimuli_set_length = $scope.stimuli_sets[0].length;
    $scope.instructions = [
      // {
      //   text: `Welcome to our guessing game!
      //         <br><br>
      //         Before you begin your task, you'll complete a brief guided tutorial (~ 2 minutes) to understand the game.
      //         <br><br>
      //         Press <strong>Next</strong> to continue.`,
      // },
      // {
      //   text: `You're watching someone play the treasure game shown to the left.
      //         <br><br>
      //         You are currently looking at an empty map with empty item slots.
      //         You control a character <img class="caption-image" src="images/human.png">,
      //         whose goal is to defeat the a monster <img class="caption-image" src="images/monster.png">.
      //         However, the character is currently too weak to fight the monster and must first collect items to become stronger.
      //         <br><br>
      //         Press the <strong>Next</strong> button to continue.`,
      //         image: "stimuli/segments/tutorial_b.png"
      // },
      {
        text: `Welcome to the Potion or Poison game!
              <br><br>
              Before you begin your task, you'll complete a brief guided tutorial (~ 2 minutes) to understand the game.
              <br><br>
              Press <strong>Next</strong> to continue.`,
      },
      {
        text: `You're playing an adventure game shown to the left. 
              <br><br>
              There is one knight <img class="caption-image" src="images/human.png"> whose goal goal is to defeat the monster <img class="caption-image" src="images/monster.png">. The black tiles on the map represent walls which cannot be passed through. there are two kinds of flasks in the game: a health potion or a poison. The flasks containing potions look identical to the flasks containing poisons and the flasks can only be placed in the orange tiles.
 <br> <br>
              The chance of defeating the monster is improved by consuming a potion, and diminishes by consuming a poison. To help the Knight defeat the monster, a Wizard has secretly re-arranged the placements of the flasks. The Wizard cannot remove poison flasks from the map.
 <br> <br>
              The adventure game requires participation of two agents and each level has two stages - there is a design stage and a play stage. In the design stage, the Wizard arranges a set of flasks among the orange tiles. Then in the play stage, the Knight decides which flasks to obtain to defeat the monster. The Knight <strong> knows </strong> that the flasks have been arranged by a helpful Wizard.
 <br> <br>
              The Wizard and the Knight do not know each other and cannot communicate. They both receive rewards if the monster is defeated at the end. Therefore, it is in the interest of both the Wizard and the Knight to optimally place and use the flasks.
 <br> <br>
              In this experiment, you are playing the role of the Knight. We will show you the map after the Wizard has rearranged the flasks, and ask you to rate which flasks are potions and which ones are poison.

 <br> <br>

 Press the <strong>Next</strong> button to continue.


              `,
        image: "stimuli/segments/tutorial_b.png",
        numPotions: 1,
        numPoisons: 1
      }, 
      {
        text: `At each trial, we will show you the flask placement and ask you questions about the <strong>type</strong> of liquid in the flask.<br>
              <br>
              Rate <strong>7</strong> if you're <strong>certain</strong> that there <strong>is</strong> a <strong>potion</strong> in the associated flask.<br>
              Rate <strong>4</strong> if you think there's an <strong>even, 50-50 chance</strong> whether the flask contains a potion or poison.             <br>
              Rate <strong>1</strong> if you're <strong>certain</strong> that there <strong>is</strong> a <strong>poison</strong> in the associated flask.<br>
              Press <strong>Next</strong> to watch what happens.
              `,
        image: "stimuli/segments/tutorial_b.png"
      }, 
      {
        text: `<br>`
              ,
        tutorial: true,
        show_questions: true,
        question_types: ["beliefs"],
        statements: ["Is flask <strong>A</strong> a Potion or a Poison? ",
                    "Is flask <strong>B</strong> a Potion or a Poison?"],
        image: "stimuli/segments/tutorial.png",
        numPotions: 1,
        numPoisons: 1
      },
      {
        image: "stimuli/segments/tutorial.png",
        ground_truth: [
           "A is a Potion",
          "B is a Poison"
        ]
      },
                {
        text: `As mentioned, you should assume that the Wizard wants you to succeed as both of you will benefit if you guess correctly (monster defeated!). The reward scheme is as follows:

<br><br>
For each question, Your rating will be compared to the answer key and rewards will be calibrated by considering the difference.

<br><br>

If the flask contains a poison and you answer 7, you receive -3 points. If you answer 1, you receive 3 points. If you answer 4, you receive 0 points.
<br><br>
Similarly, if the flask contains a potion and you answer 7, you receive 3 points. If you answer 1, you receive -3 points. If you answer 4, you receive 0 points.

<br><br>
You accumulate the points you receive over all the maps you play and will be paid a bonus at the end of the experiment, at a rate of 1 USD per 100 points.
 `
      },

      {
        text: `You've now finished the practice round and the player can fight the monster using the potions and poisons you've collected!`
      },
      {
        text: `<strong>Comprehension Questions</strong> <br>
               <br>
               For the last part of the tutorial, we will ask 5 quick questions to check your understanding of the task.<br>
               <br>
               Answer <strong>all questions correctly</strong> in order to proceed to the main experiment.
               You can retake the quiz as many times as necessary.
              `
      },
      {
        text: `<strong>Question 1/4:</strong> What is the Knight's goal?`,
        options: ["Collect all Flasks",
                  "Defeat the monster",
                  "Collect all the potions"],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 1/4:</strong> What is the Knight's goal?`,
        options: ["Collect all Flasks",
                  "Defeat the monster",
                  "Collect all the potions"],
        answer: 1,
        feedback: true
      },
      {
        text: `<strong>Question 2/4:</strong> What is your task in this game?`,
        options: ["Control the knight to defeat the monster",
                  "Explore the map",
                  "Guess whether each flask contains potion or poison"],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 2/4:</strong> What is your task in this game?`,
        options: ["Control the knight to defeat the monster",
                  "Explore the map",
                  "Guess whether each flask contains potion or poison"],
        answer: 2,
        feedback: true
      },
      {
        text: `<strong>Question 3/4:</strong> Which of the following is true?`,
        options: ["The player has <strong> no definite knowledge </strong> about the contents of each flask.",
                  "The player <strong> knows perfectly </strong> what's inside each flask.",
                  "The player <strong> might know exactly </strong> what's in each flask, but <strong> might also be unsure. </strong>"],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 3/4:</strong> Which of the following is true?`,
        options: ["The player has <strong> no definite knowledge </strong> about the contents of each flask.",
                  "The player <strong> knows perfectly </strong> what's inside each flask.",
                  "The player <strong> might know exactly </strong> what's in each flask, but <strong> might also be unsure. </strong>"],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 4/4:</strong> Which of the following is true?`,
        options: ["The Wizard strategically placed the flasks for the Knight.",
                  "The Wizard placed the flasks randomly.",
                  "The flasks are all randomly assigned."],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 4/4:</strong> Which of the following is true?`,
        options: ["The Wizard strategically placed the flasks for the Knight.",
                  "The Wizard placed the flasks randomly.",
                  "The flasks are all randomly assigned."],
        answer: 0,
        feedback: true
      },
      {
        exam_end: true,
        exam_start_id: 11
      },
      {
        text: `Congratulations! You've finished the tutorial.
               <br><br>
               You will now play the game for 10 different rounds.
               <br><br>
               Ready to start? Press <strong>Next</strong> to continue!`
      }
    ];

    instruction_images =
      $scope.instructions.filter(i => i.image !== undefined).map(i => i.image);
    preloader.preloadImages(instruction_images).then(
      function handleResolve(imglocs) {console.info("Preloaded instructions.");}
    );

    if ($location.search().skip_tutorial == "true") {
      $scope.inst_id = $scope.instructions.length - 1;
    }

    $scope.stimuli = [
      {
        "name": "1_1",
        "images": [
          "stimuli/segments/M1L1_b.png",
          "stimuli/segments/M1L1P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? ",
          "Is flask <strong>D</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 2,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
          "C is a Potion",
          "D is a Poison"
        ]
      },
      {
        "name": "1_2",
        "images": [
          "stimuli/segments/M1L1_b.png",
          "stimuli/segments/M1L1P2.png",
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
        ]
      },
      {
        "name": "1_3",
        "images": [
          "stimuli/segments/M1L1_b.png",
          "stimuli/segments/M1L1P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 2,
        ground_truth: [
          "A is a Poison",
          "B is a Poison",
          "C is a Potion"
        ]
      },
      {
        "name": "1_4",
        "images": [
          "stimuli/segments/M1L2_b.png",
          "stimuli/segments/M1L2P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison",
          "C is a Potion"
        ]
      },
      {
        "name": "1_5",
        "images": [
          "stimuli/segments/M1L2_b.png",
          "stimuli/segments/M1L2P2.png",
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison",
        ]
      },
      {
        "name": "1_6",
        "images": [
          "stimuli/segments/M1L1_b.png",
          "stimuli/segments/M1L2P3.png",
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
          "C is a Poison"
        ]
      },
      {
        "name": "2_1",
        "images": [
          "stimuli/segments/M2L1_b.png",
          "stimuli/segments/M2L1P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
          "C is a Potion"
        ]
      },
      {
        "name": "2_2",
        "images": [
          "stimuli/segments/M2L1_b.png",
          "stimuli/segments/M2L1P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison"
        ]
      },
        {
        "name": "2_3",
          "images": [
          "stimuli/segments/M2L1_b.png",
          "stimuli/segments/M2L1P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
        ]
      },
      {
        "name": "2_4",
        "images": [
          "stimuli/segments/M2L2_b.png",
          "stimuli/segments/M2L2P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? ",
          "Is flask <strong>D</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 2,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
          "C is a Potion",
          "D is a Poison"
        ]
      },
      {
        "name": "2_5",
        "images": [
          "stimuli/segments/M2L2_b.png",
          "stimuli/segments/M2L2P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison",
        ]
      },
      {
        "name": "2_6",
        "images": [
          "stimuli/segments/M2L2_b.png",
          "stimuli/segments/M2L2P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
        ]
      },
      {
        "name": "3_1",
        "images": [
          "stimuli/segments/M3L1_b.png",
          "stimuli/segments/M3L1P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison"
        ]
      },
      {
        "name": "3_2",
        "images": [
          "stimuli/segments/3_2_b.png",
          "stimuli/segments/M3L1P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison?"
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
        ]
      },
      {
        "name": "3_3",
        "images": [
          "stimuli/segments/3_3_b.png",
          "stimuli/segments/M3L1P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison"
        ]
      },
      {
        "name": "3_4",
        "images": [
          "stimuli/segments/M3L2_b.png",
          "stimuli/segments/M3L2P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Potion",
          "C is a Poison"
        ]
      },
      {
        "name": "3_5",
        "images": [
          "stimuli/segments/M3L2_b.png",
          "stimuli/segments/M3L2P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison"
        ]
      },
      {
        "name": "3_6",
        "images": [
          "stimuli/segments/M3L2_b.png",
          "stimuli/segments/M3L2P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison?"
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 2,
        ground_truth: [
          "A is a Potion",
          "B is a Poison",
          "C is a Poison"
        ]
      },
      {
        "name": "4_1",
        "images": [
          "stimuli/segments/M4L1_b.png",
          "stimuli/segments/M4L1P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
          "C is a Potion"
        ]
      },
      {
        "name": "4_2",
        "images": [
          "stimuli/segments/M4L1_b.png",
          "stimuli/segments/M4L1P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion"
        ]
      },
      {
        "name": "4_3",
        "images": [
          "stimuli/segments/M4L1_b.png",
          "stimuli/segments/M4L1P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion"
        ]
      },
      {
        "name": "4_4",
        "images": [
          "stimuli/segments/M4L2_b.png",
          "stimuli/segments/M4L2P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion"
        ]
      },
      {
        "name": "4_5",
        "images": [
          "stimuli/segments/4_5_b.png",
          "stimuli/segments/M4L2P2.png",
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
          "C is a Potion"
        ]
      },
      {
        "name": "4_6",
        "images": [
          "stimuli/segments/4_5_b.png",
          "stimuli/segments/M4L2P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Poison",
          "B is a Potion",
        ]
      },
      {
        "name": "5_1",
        "images": [
          "stimuli/segments/M5L1_b.png",
          "stimuli/segments/M5L1P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Potion",
          "C is a Poison"
        ]
      },
      {
        "name": "5_2",
        "images": [
          "stimuli/segments/M5L1_b.png",
          "stimuli/segments/M5L1P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Posion"
        ]
      },
      {
        "name": "5_3",
        "images": [
          "stimuli/segments/M5L1_b.png",
          "stimuli/segments/M5L1P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison"
        ]
      },
      {
        "name": "5_4",
        "images": [
          "stimuli/segments/M5L2_b.png",
          "stimuli/segments/M5L2P1.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? ",
          "Is flask <strong>C</strong> a Potion or a Poison? ",
          "Is flask <strong>D</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 2,
        numPoisons: 2,
        ground_truth: [
          "A is a Potion",
          "B is a Potion",
          "C is a Poison",
          "D is a Poison"
        ]
      },
      {
        "name": "5_5",
        "images": [
          "stimuli/segments/M5L2_b.png",
          "stimuli/segments/M5L2P2.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1,
        ground_truth: [
          "A is a Potion",
          "B is a Poison"
        ]
      },
      {
        "name": "5_6",
        "images": [
          "stimuli/segments/M5L2_b.png",
          "stimuli/segments/M5L2P3.png"
        ],
        "times": [
          1,
          1,
          1
        ],
        "statements": [
          "Is flask <strong>A</strong> a Potion or a Poison? ",
          "Is flask <strong>B</strong> a Potion or a Poison? "
        ],
        "length": 2,
        numPotions: 1,
        numPoisons: 1
        ,
        ground_truth: [
          "A is a Poison",
          "B is a Potion"
        ]
      }
    ]
  }
)