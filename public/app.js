// Get a reference to the database service
const root = firebase.database().ref();
const resultsRef = root.child("results");
const counterRef = root.child("counter");
const counterKey = "count";

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
      "goals": [false, false, false, false],
      "beliefs": [NaN, NaN],
      "belief_ids": [1, 2]
    };

    $scope.valid_goal = false;
    $scope.valid_belief = false;

    $scope.valid_exam = false;
    $scope.exam_score = 0;
    $scope.exam_results = [];
    $scope.exam_done = false;
    $scope.last_exam_correct = false;
    $scope.last_exam_response = "";

    $scope.show_rhs = true;
    $scope.anim_complete = true;

    $scope.true_goal = -1;
    $scope.belief_statements = [];
    $scope.belief_statement_ids = [];
    $scope.belief_statement_counts = [];
    $scope.n_displayed_statements = 2;

    $scope.ratings = [];

    $scope.replaying = false;
    $scope.replay_id = 0;

    $scope.user_count = 0;

    $scope.log = function(...args) {
      if ($location.search().debug == "true") {
        console.log(...args);
      }
    }

    $scope.store_to_db = function(key, val) {
      $scope.log("Storing " + key + " with " + JSON.stringify(val));
      if ($location.search().local != "true") {
        resultsRef.child(key).set(val);
      }
    }

    $scope.get_counter = async function () {
      if ($location.search().local == "true") {
        let max = $scope.stimuli_sets.length
        return Math.floor(Math.random() * max);
      } else {
        return counterRef.child(counterKey).once("value", function (snapshot) {
          $scope.user_count = snapshot.val();
        }).then(() => { return $scope.user_count; });
      }
    }
    
    $scope.increment_counter = function() {
      if ($location.search().local == "true") {
        return;
      } else {
        counterRef.child(counterKey).set($scope.user_count + 1);
      }
    }

    $scope.get_statement_counts = async function (stim_id) {
      let cur_stim = $scope.stimuli_set[stim_id];
      let n = cur_stim.statements.length
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

    $scope.reload_gif = function () {
      if ($scope.section == "stimuli") {
        if ($scope.part_id == -1) {
          var id = document.getElementById("stimulus-img-final");
        } else {
          var id = document.getElementById("stimulus-img");
        }
      } else {
        var id = document.getElementById("instruction-img");
      }
      id.src = id.src;
    }

    $scope.replay_all = function () {
      if ($scope.section == "stimuli") {
        var stim = $scope.stimuli_set[$scope.stim_id];
        let start_dur = $scope.stim_anim_duration(stim, 1) * 333;
        $scope.replay_id = 1;
        $scope.replaying = true;
        $scope.reload_gif();
        var advance_replay = function () {
          if ($scope.replaying && $scope.replay_id < $scope.part_id) {
            $scope.replay_id += 1;
            $scope.reload_gif();
            let dur = $scope.stim_anim_duration(stim, $scope.replay_id) * 333;
            $timeout(advance_replay, dur);
          } else {
            $scope.replaying = false;
            $scope.replay_id = 0;
          }
        }
        $timeout(advance_replay, start_dur);
      }
    }

    $scope.validate_answer = function (ans) {
      $scope.comprehension_response = ans;
      let index = $scope.instructions[$scope.inst_id].answer;
      $scope.valid_comprehension = ans == $scope.instructions[$scope.inst_id].options[index];
    }

    $scope.validate_goal = function () {
      $scope.valid_goal = $scope.response.goals.filter(c => c == true).length > 0;
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
      if ($location.search().local == "true") {
        let n = cur_stim.statements.length;
        let ids = Array.from(Array(n).keys());
        $scope.belief_statement_ids =
          $scope.array_sample(ids, $scope.n_displayed_statements);
      } else {
        var counts = await $scope.get_statement_counts(stim_id);
        $scope.log("Belief statement counts: " + counts);
        var count_idxs = counts.map((c, i) => [i, c, Math.random()]);
        count_idxs.sort((a, b) => { // Sort statement indices by count
          if (a[1] < b[1]) {
            return -1;
          } else if (a[1] > b[1]) {
            return 1;
          } else {
            return a[2] < b[2] ? -1 : 1; // Break ties at random
          }
        });
        $scope.belief_statement_ids =
          count_idxs.map(c => c[0]).slice(0, $scope.n_displayed_statements);
        $scope.belief_statement_ids.forEach(id => {counts[id] += 1;});
        $scope.set_statement_counts(stim_id, counts);
        $scope.log("Updated statement counts: " + counts);
      }
      $scope.belief_statements =
        $scope.belief_statement_ids.map(id => cur_stim.statements[id]);
      $scope.log("Belief statement IDs: " + $scope.belief_statement_ids);
      $scope.log("Belief statements: " + $scope.belief_statements);
    }

    $scope.reset_response = function () {
      $scope.response = {
        "goals": [false, false, false, false],
        "beliefs": Array($scope.belief_statements.length).fill(NaN),
        "belief_ids": $scope.belief_statement_ids
      };
    }

    $scope.advance = async function () {
      if ($scope.section == "instructions") {
        await $scope.advance_instructions()
      } else if ($scope.section == "stimuli" ) {
        await $scope.advance_stimuli()
      } else if ($scope.section == "endscreen") {
        // Do nothing
      }
    };
    
    $scope.advance_instructions = async function () {
      if ($scope.inst_id == $scope.instructions.length - 1) {
        // Initialize stimuli section
        $scope.section = "stimuli";
        $scope.stim_id = 0;
        $scope.part_id = 0;
        $scope.ratings = [];
        $scope.true_goal = $scope.stimuli_set[$scope.stim_id].goal;
        $scope.anim_complete = true;
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
      $scope.reset_response();
      $scope.valid_goal = false;
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
      }  else if ($scope.part_id < 0) {
        // Advance to first part
        $scope.part_id = $scope.part_id + 1;
        $scope.ratings = [];
        $scope.true_goal = $scope.stimuli_set[$scope.stim_id].goal;
        await $scope.set_belief_statements($scope.stim_id);
        $scope.anim_complete = true;
        start_time = (new Date()).getTime();
      } else if ($scope.part_id < $scope.stimuli_set[$scope.stim_id].length) {
        // Advance to next part
        if ($scope.part_id > 0) {
          var step_ratings = $scope.compute_ratings($scope.response);
          $scope.ratings.push(step_ratings);
          $scope.log(step_ratings);
        }
        $scope.part_id = $scope.part_id + 1;
        if ($scope.part_id == $scope.stimuli_set[$scope.stim_id].length) {
          // Store ratings
          $scope.store_to_db($scope.user_id + "/" + $scope.stimuli_set[$scope.stim_id].name, $scope.ratings);
          // Advance to next problem.
          $scope.part_id = -1;
          $scope.stim_id = $scope.stim_id + 1;
          $scope.anim_complete = true;
          if ($scope.stim_id < $scope.stimuli_set.length) {
            preloader.preloadImages($scope.stimuli_set[$scope.stim_id].images).then(
              function handleResolve(imglocs) {console.info("Preloaded next stimulus.");});
          }
        } else {
          // Begin timer to set animation completion flag
          $scope.anim_complete = false;
          anim_duration = $scope.cur_stim_anim_duration() * 333;
          $timeout(function() {$scope.anim_complete = true;}, anim_duration);
        }
      }
      $scope.reset_response();
      $scope.valid_goal = false;
      $scope.valid_belief = false;
    };

    $scope.compute_ratings = function (response) {
      let cur_stim = $scope.stimuli_set[$scope.stim_id];

      // Count probabilities from checkboxes
      let n_checked = response.goals.filter(c => c == true).length;
      let goal_probs = [0, 0, 0, 0];
      response.goals.forEach((check, index) => {
        if (check) {
          goal_probs[index] = (1 / n_checked);
        }
      });
      let true_goal_probs = goal_probs[$scope.true_goal-1];

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
        "goal_probs": goal_probs,
        "true_goal_probs": true_goal_probs,
        "statement_ratings": statement_ratings,
        "statement_probs": statement_probs,
        "statement_ids": response.belief_ids.map(v => v+1),
      }
      return rating;
    };

    $scope.style_statement = function (stmt) {
      stmt = stmt.replaceAll("red key", "<span class='key-red'>red key</span>");
      stmt = stmt.replaceAll(" red ", " <span class='key-red'>red</span> ");
      stmt = stmt.replaceAll("blue key", "<span class='key-blue'>blue key</span>");
      stmt = stmt.replaceAll(" blue ", " <span class='key-blue'>blue</span> ");
      stmt = stmt.replaceAll("no key", "<span class='key-none'>no key</span>");
      stmt = stmt.replaceAll(" not ", " <span class='key-none'>not</span> ");
      stmt = stmt.replaceAll(" could ", " <span class='modal'>could</span> ");
      stmt = stmt.replaceAll(" must ", " <span class='modal'>must</span> ");
      stmt = stmt.replaceAll(" might ", " <span class='modal'>might</span> ");
      stmt = stmt.replaceAll(" likely ", " <span class='modal'>likely</span> ");
      stmt = stmt.replaceAll(" unlikely ", " <span class='modal'>unlikely</span> ");
      stmt = stmt.replaceAll(" sure ", " <span class='modal'>sure</span> ");
      stmt = stmt.replaceAll(" unsure ", " <span class='modal'>unsure</span> ");
      stmt = stmt.replaceAll(" certain ", " <span class='modal'>certain</span> ");
      stmt = stmt.replaceAll(" uncertain ", " <span class='modal'>uncertain</span> ");
      stmt = stmt.replaceAll(/(box \d)/g, "<strong>$1</strong>");
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
    $scope.has_goal_question = function () {
      if ($scope.section == "stimuli") {
        return $scope.part_id > 0
      } else if ($scope.section == "instructions") {
        return ($scope.instructions[$scope.inst_id].question_types != null &&
                $scope.instructions[$scope.inst_id].question_types.includes("goals"))
      }
      return false
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

    $scope.disable_questions = function () {
      return $scope.section == "stimuli" && !$scope.anim_complete;
    };

    $scope.cur_stim_image = function () {
      if ($scope.section != "stimuli" || $scope.stim_id < 0) {
        return "stimuli/segments/demo_1.gif"
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

    $scope.cur_stim_anim_duration = function () {
      let stimulus = $scope.stimuli_set[$scope.stim_id];
      return $scope.stim_anim_duration(stimulus, $scope.part_id);
    }

    $scope.stim_anim_duration = function (stimulus, part_id) {
      if (part_id <= 0 || part_id == stimulus.length) {
        return 0
      } else {
        t_start = stimulus.times[part_id - 1];
        t_stop = stimulus.times[part_id];
        return t_stop - t_start
      }
    }

    $scope.array_equals = function (a, b) {
      return Array.isArray(a) &&
          Array.isArray(b) &&
          a.length === b.length &&
          a.every((val, index) => val === b[index]);
    }

    $scope.array_shuffle = function (arr) {
        return arr.map(a => [a, Math.random()])
          .sort((a,b) => {return a[1] < b[1] ? -1 : 1;}).map(a => a[0]);
    }

    $scope.array_sample = function(arr, n) {
      return $scope.array_shuffle(arr).slice(0, n); 
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

    $scope.stimuli_sets = [
      [1]
    ]

    $scope.stimuli_set_length = $scope.stimuli_sets[0].length;
    $scope.instructions = [
      {
        text: `Welcome to our guessing game!
              <br><br>
              Before you begin your task, you'll complete a brief guided tutorial (~ 2 minutes) to understand the game.
              <br><br>
              Press <strong>Next</strong> to continue.`,
      },
      {
        text: `You're watching someone play the treasure game shown to the left.
              <br><br>
              The player controls a character <img class="caption-image" src="images/human.png">,
              and their goal is to defeat the a monster <img class="caption-image" src="images/monster.png">.
              The player is currently too weak to fight the monster and must collect potions <img class="caption-image" src="images/potion.png">
              to become strong enough to fight the monster. However, there are also poisons <img class="caption-image" src="images/potion.png"> on
              the map that look identical to the potions. You, the player must identify which flasks contain potions and which contain poisons.

              <br><br>
              <u>Note: The map designer placed the flasks in a helpful and logical manner</u>

              <br><br>
              The rules of the game are as follows:
              <br>
              <ul>
              <li> The player has a full view of the map at all time.</li>
              <li> The player's goal is to collect <strong>only</strong> the potions.</li>
              <li> Each flask <img class="caption-image" src="images/potion.png">
                 contains <strong>either</strong> a <strong>potion or poison</strong>
              </li>
              <li> The player <strong>does not</strong> know what's in each flask.</li>
              </ul>
              Your task is to discern the <strong>location</strong> of the potions to collect and <strong>avoid</strong> the poison,
              based on them being placed by a rational designer.<br>
              <br>
              Press the <strong>Next</strong> button to continue.
              `,
        image: "stimuli/segments/tutorial.png"
      }, 
      {
        text: `At each step in this game, you will watch the player take several actions.<br>
              <br>
              We will then ask you questions about the <strong>type</strong> of liquid in the flask.<br>
              <br>
              Press <strong>Next</strong> to watch what happens.
              `,
        image: "stimuli/segments/tutorial.png"
      }, 
      {
        text: `Please read each of the following statements about what the player currently believes and answer them.<br>
              <br>
              Rate <strong>7</strong> if you're <strong>certain</strong> that there <strong>is</strong> a <strong>potion</strong> in the associated flask.<br>
              Rate <strong>1</strong> if you're <strong>certain</strong> that there <strong>is</strong> a <strong>poison</strong> in the associated flask.<br>
              Rate <strong>4</strong> if you think there's an <strong>even, 50-50 chance</strong> whether the flask contains a potion or poison.`,
        tutorial: true,
        show_questions: true,
        question_types: ["beliefs"],
        statements: ["Flask <strong>A</strong> is a: ",
                    "Flask <strong>B</strong> is a:"],
        image: "stimuli/segments/tutorial.png",
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
        text: `<strong>Question 1/5:</strong> What is the player investigating?`,
        options: ["The map",
                  "The flasks",
                  "The monster"],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 1/5:</strong>  What is the player investigating?`,
        options: ["The map",
                  "The flasks",
                  "The monster"],
        answer: 1,
        feedback: true
      },
      {
        text: `<strong>Question 2/5:</strong> What is your task in this game?`,
        options: ["Run away from the monster",
                  "Explore the map",
                  "Guess the identity of the liquid in each flask"],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 2/5:</strong> What is your task in this game?`,
        options: ["Run away from the monster",
                  "Explore the map",
                  "Guess the identity of the liquid in each flask"],
        answer: 2,
        feedback: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following is true?`,
        options: ["The player has <strong> no definite knowledge </strong> about the contents of each flask.",
                  "The player <strong> knows perfectly </strong> what's inside each flask.",
                  "The player <strong> might know exactly </strong> what's in each flask, but <strong> might also be unsure. </strong>"],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following is true?`,
        options: ["The player has <strong> no definite knowledge </strong> about the contents of each flask.",
                  "The player <strong> knows perfectly </strong> what's inside each flask.",
                  "The player <strong> might know exactly </strong> what's in each flask, but <strong> might also be unsure. </strong>"],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 4/5:</strong> Which of the following is true?`,
        options: ["The map designer placed the flasks logically and helpfully.",
                  "The map designer placed the flasks randomly.",
                  "The flasks are all potions."],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 4/5:</strong> Which of the following is true?`,
        options: ["The map designer placed the flasks logically and helpfully.",
                  "The map designer placed the flasks randomly.",
                  "The flasks are all potions."],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 5/5:</strong> How can you tell what liquid is in the flask?`,
        options: ["Guess <strong>either potion or poison</strong> and hope for the best",
                  "The liquid type is explicitly stated somewhere on the map",
                  "Try your best to infer the liquid type knwoing the designer placed them logically"],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 5/5:</strong> How can you tell what liquid is in the flask?`,
        options: ["Guess <strong>either potion or poison</strong> and hope for the best",
                  "The liquid type is explicitly stated somewhere on the map",
                  "Try your best to infer the liquid type knwoing the designer placed them logically"],
        answer: 2,
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
          "stimuli/segments/M1L1P1.png",
          "stimuli/segments/M1L1P1_1.gif",
          "stimuli/segments/M1L1P1_2.gif",
        ],
        "times": [
          1,
          6,
          25
        ],
        "statements": ["The player believes that there is a <strong>potion</strong> in this flask.",
                       "The player believes that there is a <strong>poison</strong> in this flask."],
        "length": 3
      }
    ]
  }
)