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

    $scope.stim_reward = 0;
    $scope.total_reward = 0;
    $scope.total_payment = 0;

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
        $scope.stim_reward = 0;
        $scope.section = "stimuli";
        $scope.stim_id = 0;
        $scope.part_id = 0;
        $scope.ratings = [];
        $scope.stim_reward = 0;
        $scope.total_reward = 0;
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
        if ($scope.total_reward > 0) {
          $scope.total_payment = ($scope.total_reward / 20).toFixed(2)
        } else {
          $scope.total_payment = 0.0
        }
        $scope.total_reward = $scope.total_reward.toFixed(1)
        $scope.store_to_db($scope.user_id + "/total_reward", $scope.total_reward);
        $scope.store_to_db($scope.user_id + "/total_payment", $scope.total_payment);
      }  else if ($scope.part_id < 0) {
        // Advance to first part
        $scope.part_id = $scope.part_id + 1;
        $scope.ratings = [];
        $scope.stim_reward = 0;
        $scope.true_goal = $scope.stimuli_set[$scope.stim_id].goal;
        await $scope.set_belief_statements($scope.stim_id);
        $scope.anim_complete = true;
        start_time = (new Date()).getTime();
      } else if ($scope.part_id < $scope.stimuli_set[$scope.stim_id].length) {
        // Advance to next part
        if ($scope.part_id > 0) {
          var step_ratings = $scope.compute_ratings($scope.response);
          $scope.ratings.push(step_ratings);
          $scope.stim_reward = $scope.stim_reward + step_ratings.reward;
          $scope.log(step_ratings);
          $scope.log("Step reward: " + step_ratings.reward);
        }
        $scope.part_id = $scope.part_id + 1;
        if ($scope.part_id == $scope.stimuli_set[$scope.stim_id].length) {
          // Store ratings
          $scope.total_reward += $scope.stim_reward;
          $scope.store_to_db($scope.user_id + "/" + $scope.stimuli_set[$scope.stim_id].name, $scope.ratings);
          $scope.store_to_db($scope.user_id + "/" + $scope.stimuli_set[$scope.stim_id].name + "/reward", $scope.stim_reward);
          $scope.log("Stimulus reward: " + $scope.stim_reward);
          $scope.log("Total reward: " + $scope.total_reward);
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

      // Set reward to true goal probs multiplied by 10
      let reward = true_goal_probs;

      rating = {
        "timestep": cur_stim.times[$scope.part_id],
        "time_spent": ((new Date()).getTime() - start_time) / 1000.,
        "goal_probs": goal_probs,
        "true_goal_probs": true_goal_probs,
        "statement_ratings": statement_ratings,
        "statement_probs": statement_probs,
        "statement_ids": response.belief_ids.map(v => v+1),
        "reward": reward
      }
      return rating;
    };

    $scope.goal_images = [
      "images/gem_triangle.png",
      "images/gem_square.png",
      "images/gem_hexagon.png",
      "images/gem_circle.png"
    ];
    $scope.possible_goals = ["triangle", "square", "hexagon", "circle"];

    $scope.style_statement = function(stmt) {
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
      "Definitely<br>False",
      "",
      "",
      "Even<br>Chance",
      "",
      "",
      "Definitely<br>True",
    ];

    $scope.goal_feedback = function() {
      if ($scope.stim_id <= 0 || $scope.section != "stimuli") {
        return "";
      }
      let goal_id = $scope.stimuli_set[$scope.stim_id - 1].goal;
      let goal_str = $scope.possible_goals[goal_id - 1];
      let styled_goal_str = "<strong>" + goal_str + "</strong> " + "<img class='caption-image' src='" + $scope.goal_images[goal_id - 1] + "'/>";
      return styled_goal_str
    };

    $scope.belief_feedback = function() {
      if ($scope.stim_id <= 0 || $scope.section != "stimuli") {
        return "";
      }
      let key_colors = $scope.stimuli_set[$scope.stim_id - 1].relevant_colors;
      let key_strs = key_colors.map(function(key_color) {
        return "<span class='key-" + key_color + "'>" + key_color + " key</span>";
      });
      let box_ids = $scope.stimuli_set[$scope.stim_id - 1].relevant_boxes;
      let box_strs = box_ids.map(function(box_id) {
        return "<strong>box " + box_id + "</strong>";
      });
      let key_box_strs = key_strs.map(function(key_str, i) {
        return "a " + key_str + " in " + box_strs[i]
      });
      if (key_box_strs.length == 0) {
        return "";
      } else if (key_box_strs.length == 1) {
        return "They found " + key_box_strs[0] + ".<br><br>";
      } else {
        return "They found " + key_box_strs.slice(0, -1).join(", ") + " and " + key_box_strs.slice(-1) + ".<br><br>";
      }
    };

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
      [12, 1, 14, 16, 20, 3, 11, 17, 13, 19],
      [9, 6, 8, 5, 15, 4, 18, 2, 7, 10],
      [12, 10, 20, 1, 18, 5, 9, 17, 13, 6],
      [4, 14, 11, 3, 19, 15, 8, 2, 7, 16],
      [6, 14, 4, 8, 12, 3, 15, 17, 13, 9],
      [18, 16, 7, 5, 1, 20, 10, 2, 11, 19],
      [16, 14, 8, 11, 17, 3, 9, 1, 18, 13],
      [2, 15, 12, 7, 10, 6, 19, 4, 20, 5],
      [11, 15, 3, 14, 2, 5, 7, 20, 9, 17],
      [19, 8, 4, 12, 6, 10, 18, 13, 1, 16]
    ]

    $scope.stimuli_set_length = $scope.stimuli_sets[0].length;
    $scope.instructions = [
      {
        text: `Welcome to the Doors and Keys game!
              <br><br>
              Before you begin your task, you'll complete a brief guided tutorial (~ 2 minutes) to understand the game.
              <br><br>
              Press <strong>Next</strong> to continue.`,
      },
      {
        text: `You're watching someone play the treasure game shown to the left.
              <br><br>
              There is one Adventurer <img class="caption-image" src="images/human.png"> whose goal is to collect fruit <img class="caption-image" src="images/banana.png">, <img class="caption-image" src="images/berry.png">, <img class="caption-image" src="images/orange.png">.
              The black tiles on the map represent walls which cannot be passed through.
              Locked doors <img class="caption-image" src="images/door.png"> blokc the Adventurer's path to the fruit and can only be unlocked with a specific key <img class="caption-image" src="images/key.png">.
              The Adventurer knows that the chamber Architect has designed so that an adventurer could infer what key matched with what door.
 <br> <br>
              The adventure game requires participation of two agents and each level has two stages - there is a design stage and a play stage.
              In the design stage, the Architect arranges a set of keys among the orange tiles.
              Then in the play stage, the Adventurer decides which key to use on each door.
 <br> <br>
              The Architect and the Adventurer do not know each other and cannot communicate. They both receive rewards if the doors are unlocked and the fruits collected.
              Therefore, it is in the interest of both the Architect and the Adventurer to optimally place and use the keys.
 <br> <br>
              In this experiment, you are playing the role of the Adventurer. We will show you the map after the Architect has rearranged the keys, and ask you to match which key corresponds to what door(s).
              Keys have the potential to unlock one, none, or multiple doors but can only be used once for each chamber map.

 <br> <br>

 Press the <strong>Next</strong> button to continue.


              `,
        image: "stimuli/segments/demo_1.gif"
      }, 
      {
        text: `At each step in this game, you will watch the player take several actions.<br>
              <br>
              We will then ask you one question about the player's <strong>goal</strong>,
              and another set of questions about the player's <strong>current beliefs</strong>.<br>
              <br>
              Press <strong>Next</strong> to watch what happens.
              `,
        image: "stimuli/segments/demo_1.gif"
      }, 
      {
        text: `The player picked up a <span class="key-red">red key</span>. Which gem do you think they're trying to reach?<br>
              <br>
              If more than one gem seems likely, you can select all likely gems.
              Remember that some keys might be <i>hidden</i> among the boxes.
              <br>
              <br>
              `,
        tutorial: true,
        show_questions: true,
        question_types: ["goals"],
        image: "stimuli/segments/demo_2.gif",
        delay: 2600
      },
      {
        text: `You've answered the question about the player's goal.
              We will now ask several questions about what the player
              <strong>currently believes</strong> about the boxes. <br>
              <br>
              Press <strong>Next</strong> to continue.
              `,
        tutorial: true,
        image: "stimuli/segments/demo_2.gif"
      },
      {
        text: `Please read each of the following statements about what the player currently believes, and rate them on a scale from 1 to 7.<br>
              <br>
              Rate <strong>7</strong> if you're <strong>certain</strong> the statement <strong>correctly describes</strong> the player's current beliefs.<br>
              Rate <strong>1</strong> if you're <strong>certain</strong> the statement <strong>does not describe</strong> the player's current beliefs.<br>
              Rate <strong>4</strong> if you think there's an <strong>even, 50-50 chance</strong> whether the statement is a true or false description of what the player currently believes.<br>
              <br>
              Remember that the player just picked up a <span class="key-red">red key</span> and walked towards box 3.
              `,
        tutorial: true,
        show_questions: true,
        question_types: ["beliefs"],
        statements: ["The player believes that there might be a blue key in box 3.",
                     "The player believes that there must be a blue key in box 2."],
        image: "stimuli/segments/demo_2.gif",
      },
      {
        image: "stimuli/segments/demo_3.gif",
        text: `What about now? Do these actions make any goal more likely than the others?
              And do they indicate what the player might currently think is inside the boxes?
              `,
        tutorial: true,
        show_questions: true,
        question_types: ["goals", "beliefs"],
        statements: ["The player believes that there might be a blue key in box 3.",
                     "The player believes that there must be a blue key in box 2."],
        delay: 1800
      },
      {
        image: "stimuli/segments/demo_4.gif",
        text: `The player opens <strong>box 1</strong> and finds that there is no key inside,
              then takes several steps to the right. How does this change your judgments?
              <br><br>
              Note that the agent knows that the puzzle is solvable which implies that there must be a red and a blue key present in this maze.
              `,
        tutorial: true,
        show_questions: true,
        question_types: ["goals", "beliefs"],
        statements: ["The player believes that there might be a blue key in box 3.",
                     "The player believes that there must be a blue key in box 2."],
        delay: 1500
      },
      {
        image: "stimuli/segments/demo_5.gif",
        text: `As you might have guessed, the player was trying to reach the
              triangle gem <img class="caption-image" src="images/gem_triangle.png">
              by using a <span class="key-blue">blue key</span> in box 2.`,
        tutorial: true,
        show_questions: false,
      },
      {
        text: `You've now finished the practice round! <br>
              <br>
              <strong>Bonus Payment Points</strong>
              <br><br>
              As you play, you can earn <strong>bonus payment</strong> by collecting points for the guesses you make.<br>
              For each round, you get <strong>1/<i>N</i> points</strong> if the human's <i>true</i> goal is one of the <strong><i>N</i></strong> gems you guessed.<br>
              <br>
              Your points from all rounds are converted to bonus payment at a rate of <strong>40 points = $1.00.</strong>
              `
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
        text: `<strong>Question 1/5:</strong> How many gems is the player trying to collect?`,
        options: ["Exactly 1 gem.",
                  "1 or 2 gems.",
                  "All of the gems."],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 1/5:</strong> How many gems is the player trying to collect?`,
        options: ["Exactly 1 gem.",
                  "1 or 2 gems.",
                  "All of the gems."],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 2/5:</strong> What is your task in this game?`,
        options: ["Answer questions about the player's goals and current beliefs.",
                  "Control the player on the map and collect the gems.",
                  "Guess the player's next actions."],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 2/5:</strong> What is your task in this game?`,
        options: ["Answer questions about the player's goals and current beliefs.",
                  "Control the player on the map and collect the gems.",
                  "Guess the player's next actions."],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following is true?`,
        options: ["The player has <strong> no knowledge </strong> about the contents of each box.",
                  "The player <strong> knows perfectly </strong> what's inside each box.",
                  "The player <strong> might know exactly </strong> what's in each box, but <strong> might also be unsure. </strong>"],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following is true?`,
        options: ["The player has <strong> no knowledge </strong> about the contents of each box.",
                  "The player <strong> knows perfectly </strong> what's inside each box.",
                  "The player <strong> might know exactly </strong> what's in each box, but <strong> might also be unsure. </strong>"],
        answer: 2,
        feedback: true
      },
      {
        text: `<strong>Question 4/5:</strong> You think the player needs a red key and you \
              see the player walking towards box 1 and box 2. Which statement is the most plausible?`,
        options: ["The player believes there <strong> must be </strong> a red key in box 1.",
                  "The player believes there <strong> must be </strong> a red key in box 2.",
                  "The player believes there <strong> might be </strong> a red key in box 1 or box 2."],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 4/5:</strong> You think the player needs a red key and you \
              see the player walking towards box 1 and box 2. Which statement is the most plausible?`,
        options: ["The player believes there <strong> must be </strong> a red key in box 1.",
                  "The player believes there <strong> must be </strong> a red key in box 2.",
                  "The player believes there <strong> might be </strong> a red key in box 1 or box 2."],
        answer: 2,
        feedback: true
      },
      {
        text: `<strong>Question 5/5:</strong> You're watching the player and <strong>two</strong> of the gems seem
              likely to be the player's goal, but you're not sure which. What should you do?`,
        options: ["Guess <strong>one</strong> of the two likely gems, and hope for the best.",
                  "Guess <strong>both</strong> likely gems, because you're not sure.",
                  "Guess <strong>all</strong> of the gems, because who knows?"],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 5/5:</strong> You're watching the player and <strong>two</strong> of the gems seem
              likely to be the player's goal, but you're not sure which. What should you do?`,
        options: ["Guess <strong>one</strong> of the two likely gems, and hope for the best.",
                  "Guess <strong>both</strong> likely gems, because you're not sure.",
                  "Guess <strong>all</strong> of the gems, because who knows?"],
        answer: 1,
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
        "goal": 2,
        "images": [
          "stimuli/segments/p1_1_1.gif",
          "stimuli/segments/p1_1_2.gif",
          "stimuli/segments/p1_1_3.gif",
          "stimuli/segments/p1_1_4.gif",
          "stimuli/segments/p1_1_5.gif"
        ],
        "times": [
          1,
          6,
          9,
          15,
          27
        ],
        "statements": ["The player believes the blue key is in box 1.",
 "The player is sure there must be a blue key in box 3.",
 "The player believes that box 1 or 2 contain the blue key, but leans more towards box 1.",
 "The player thinks that box 1 is empty.",
 "The player believes that box 1 contains the blue key."],
        "relevant_colors": [
          "blue"
        ],
        "relevant_boxes": [
          1
        ],
        "length": 4
      },
      {
        "name": "1_2",
        "goal": 2,
        "images": [
          "stimuli/segments/p1_2_1.gif",
          "stimuli/segments/p1_2_2.gif",
          "stimuli/segments/p1_2_3.gif",
          "stimuli/segments/p1_2_4.gif",
          "stimuli/segments/p1_2_5.gif",
          "stimuli/segments/p1_2_6.gif"
        ],
        "times": [
          1,
          4,
          6,
          10,
          14,
          30
        ],
        "statements": ["The player is sure there must be a blue key in box 3.",
 "The player knows that boxes 1 and 2 did not have the blue key.",
 "The player believes that the blue key is in box number 3.",
 "The player believes that box 3 is more likely to contain a red key than box 1.",
 "The player believes that box 3 is empty."],

        "relevant_colors": [
          "blue"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 5
      },
      {
        "name": "1_3",
        "goal": 2,
        "images": [
          "stimuli/segments/p1_3_1.gif",
          "stimuli/segments/p1_3_2.gif",
          "stimuli/segments/p1_3_3.gif",
          "stimuli/segments/p1_3_4.gif"
        ],
        "times": [
          1,
          7,
          11,
          23
        ],
        "statements": ["The player thinks that box 1 is empty.",
 "The player is uncertain about the contents of box 3.",
 "The player believes that box 2 is empty.",
 "The player believes that if box 1 does not have a blue key, then box 3 has a blue key.",
 "The player believes there may be a key in box 1."],

        "relevant_colors": [
          "blue"
        ],
        "relevant_boxes": [
          1
        ],
        "length": 3
      },
      {
        "name": "2_1",
        "goal": 3,
        "images": [
          "stimuli/segments/p2_1_1.gif",
          "stimuli/segments/p2_1_2.gif",
          "stimuli/segments/p2_1_3.gif",
          "stimuli/segments/p2_1_4.gif",
          "stimuli/segments/p2_1_5.gif"
        ],
        "times": [
          1,
          4,
          10,
          17,
          32
        ],
        "statements": ["The player knows that box 1 does not have the blue key.",
 "The player believes if the red key is not in box 2 then it must be in box 3.",
 "The player believes that box 2 has a key.",
 "The player believes box 2 might hold a red key.",
 "The player knows that box 2 is empty."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          2
        ],
        "length": 4
      },
      {
        "name": "2_2",
        "goal": 1,
        "images": [
          "stimuli/segments/p2_2_1.gif",
          "stimuli/segments/p2_2_2.gif",
          "stimuli/segments/p2_2_3.gif",
          "stimuli/segments/p2_2_4.gif",
          "stimuli/segments/p2_2_5.gif"
        ],
        "times": [
          1,
          4,
          6,
          11,
          25
        ],
        "statements": ["The player thinks that box 1 is empty.",
 "The player believes that box 3 is empty.",
 "The player thinks that box 1 is empty.",
 "The player believes that box 3 may contain a red key.",
 "The player believes that box 3 is more likely to contain a red key than box 1."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 4
      },
      {
        "name": "2_3",
        "goal": 3,
        "images": [
          "stimuli/segments/p2_3_1.gif",
          "stimuli/segments/p2_3_2.gif",
          "stimuli/segments/p2_3_3.gif",
          "stimuli/segments/p2_3_4.gif"
        ],
        "times": [
          1,
          4,
          10,
          25
        ],
        "statements": ["The player believes that box 2 may contain the red key.",
 "The player believes that box 2 is empty.",
 "The player thinks that boxes 2 and 3 might or might not contain a red key.",
 "The player believes the red key is in box 2.",
 "The player thinks that there's more likely to be a red key in box 1 or 3 than box 2."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          1
        ],
        "length": 3
      },
      {
        "name": "3_1",
        "goal": 3,
        "images": [
          "stimuli/segments/p3_1_1.gif",
          "stimuli/segments/p3_1_2.gif",
          "stimuli/segments/p3_1_3.gif",
          "stimuli/segments/p3_1_4.gif",
          "stimuli/segments/p3_1_5.gif",
          "stimuli/segments/p3_1_6.gif"
        ],
        "times": [
          1,
          5,
          9,
          12,
          20,
          46
        ],
        "statements": ["The player believes box 2 is least likely to hold the blue key.",
 "The player believes that box 3 holds the blue key.",
 "The player knows box 3 contains a blue key.",
 "The player thinks that box 1 is empty.",
 "The player knows that box 2 is empty."],
        "relevant_colors": [
          "blue"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 5
      },
      {
        "name": "3_2",
        "goal": 4,
        "images": [
          "stimuli/segments/p3_2_1.gif",
          "stimuli/segments/p3_2_2.gif",
          "stimuli/segments/p3_2_3.gif",
          "stimuli/segments/p3_2_4.gif"
        ],
        "times": [
          1,
          14,
          22,
          47
        ],
        "statements": ["The player believes that box 2 may contain the red key.",
 "The player believes the red key is in box 2.",
 "The player does not know which box contains a red key.",
 "The player believes that box 3 may contain a red key.",
 "The player believes that box 1 might have a red key."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          2
        ],
        "length": 3
      },
      {
        "name": "3_3",
        "goal": 3,
        "images": [
          "stimuli/segments/p3_3_1.gif",
          "stimuli/segments/p3_3_2.gif",
          "stimuli/segments/p3_3_3.gif",
          "stimuli/segments/p3_3_4.gif"
        ],
        "times": [
          1,
          9,
          15,
          43
        ],
        "statements": ["The player knows that box 1 does not have the blue key.",
 "The player thinks that box 1 is empty.",
 "The player is unsure whether the blue key is in box 3 or 1.",
 "The player believes that box 3 will either be empty or have a blue key.",
 "The player believes the red key is in box 2."],
        "relevant_colors": [
          "blue"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 3
      },
      {
        "name": "4_1",
        "goal": 3,
        "images": [
          "stimuli/segments/p4_1_1.gif",
          "stimuli/segments/p4_1_2.gif",
          "stimuli/segments/p4_1_3.gif",
          "stimuli/segments/p4_1_4.gif"
        ],
        "times": [
          1,
          11,
          20,
          35
        ],
        "statements": ["The player believes box 1 is more likely to contain a red key than box 2.",
 "The player believes that box 3 may contain a red key.",
 "The player thinks that there's more likely to be a red key in box 2 or 3 than box 1.",
 "The player believes that either box 2 or 3 contains a red key.",
 "The player believes box 1 does not hold a red key."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          2
        ],
        "length": 3
      },
      {
        "name": "4_2",
        "goal": 3,
        "images": [
          "stimuli/segments/p4_2_1.gif",
          "stimuli/segments/p4_2_2.gif",
          "stimuli/segments/p4_2_3.gif",
          "stimuli/segments/p4_2_4.gif",
          "stimuli/segments/p4_2_5.gif"
        ],
        "times": [
          1,
          7,
          13,
          23,
          35
        ],
        "statements": ["The player believes that box 3 may contain a red key.",
 "The player knows that box 2 is empty.",
 "The player is sure that box 1 and 2 are empty.",
 "The player believes that box 2 may contain a red key.",
 "The player thinks that box 1 is empty."],
        "relevant_colors": [
          "red",
          "red"
        ],
        "relevant_boxes": [
          1,
          3
        ],
        "length": 4
      },
      {
        "name": "4_3",
        "goal": 3,
        "images": [
          "stimuli/segments/p4_3_1.gif",
          "stimuli/segments/p4_3_2.gif",
          "stimuli/segments/p4_3_3.gif",
          "stimuli/segments/p4_3_4.gif",
          "stimuli/segments/p4_3_5.gif",
          "stimuli/segments/p4_3_6.gif"
        ],
        "times": [
          1,
          11,
          20,
          23,
          27,
          40
        ],
        "statements": ["The player believes that box 2 may contain a red key.",
 "The player is unsure which box has a key.",
 "The player believes that box 3 may contain a red key.",
 "The player believes that the red key must be in box 3.",
 "The player believes there might be a key in box 2."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          2
        ],
        "length": 5
      },
      {
        "name": "5_1",
        "goal": 2,
        "images": [
          "stimuli/segments/p5_1_1.gif",
          "stimuli/segments/p5_1_2.gif",
          "stimuli/segments/p5_1_3.gif",
          "stimuli/segments/p5_1_4.gif"
        ],
        "times": [
          1,
          6,
          13,
          34
        ],
        "statements": ["The player believes that box 3 might have a red key.",
 "The player believes that there is a red key in box 2.",
 "The player believes that box 1 is empty.",
 "The player believes that either box 2 or 3 has a red key.",
 "The player believes that the red key must be in box 3."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 3
      },
      {
        "name": "5_2",
        "goal": 2,
        "images": [
          "stimuli/segments/p5_2_1.gif",
          "stimuli/segments/p5_2_2.gif",
          "stimuli/segments/p5_2_3.gif",
          "stimuli/segments/p5_2_4.gif",
          "stimuli/segments/p5_2_5.gif",
        ],
        "times": [
          1,
          6,
          21,
          28,
          49
        ],
        "statements": ["The player believes that box 2 may contain a red key.",
 "The player believes that box 3 is empty.",
 "The player knows that the boxes 1 and 2 were both empty.",
 "The player believes that the red key must be in box 3.",
 "The player is uncertain about the contents of box 3."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 4
      },
      {
        "name": "6_1",
        "goal": 3,
        "images": [
          "stimuli/segments/p6_1_1.gif",
          "stimuli/segments/p6_1_2.gif",
          "stimuli/segments/p6_1_3.gif"
        ],
        "times": [
          1,
          9,
          29
        ],
        "statements": ["The player believes that box 2 probably has a key.",
 "The player knows that box 2 is empty.",
 "The player knows that there is a blue or red key in box 1.",
 "The player believes that either a red key or a blue key is in box 2.",
 "The player believes that box 1 might hold a blue key."],
        "relevant_colors": [
          "red",
          "blue"
        ],
        "relevant_boxes": [
          1,
          2
        ],
        "length": 2
      },
      {
        "name": "6_2",
        "goal": 3,
        "images": [
          "stimuli/segments/p6_2_1.gif",
          "stimuli/segments/p6_2_2.gif",
          "stimuli/segments/p6_2_3.gif",
          "stimuli/segments/p6_2_4.gif"
        ],
        "times": [
          1,
          16,
          19,
          33
        ],
        "statements": ["The player believes that box number 2 holds the red key.",
 "The player believes that box 2 holds a blue key.",
 "The player believes the blue key is in box 1.",
 "The player believes that there is a red key in box 2.",
 "The player believes there might be a key in Box 1 or Box 2."],
        "relevant_colors": [
          "blue"
        ],
        "relevant_boxes": [
          2
        ],
        "length": 3
      },
      {
        "name": "6_3",
        "goal": 3,
        "images": [
          "stimuli/segments/p6_3_1.gif",
          "stimuli/segments/p6_3_2.gif",
          "stimuli/segments/p6_3_3.gif",
          "stimuli/segments/p6_3_4.gif"
        ],
        "times": [
          1,
          5,
          14,
          37
        ],
        "statements": ["The player believes that the boxes are both empty.",
 "The player believes that box 1 might have a red key.",
 "The player believes the red key is in box 2.",
 "The player believes that box 1 is empty.",
 "The player believes there might be a key in box 1 or box 2."],
        "relevant_colors": [
        ],
        "relevant_boxes": [
        ],
        "length": 3
      },
      {
        "name": "7_1",
        "goal": 2,
        "images": [
          "stimuli/segments/p7_1_1.gif",
          "stimuli/segments/p7_1_2.gif",
          "stimuli/segments/p7_1_3.gif",
          "stimuli/segments/p7_1_4.gif",
          "stimuli/segments/p7_1_5.gif"
        ],
        "times": [
          1,
          7,
          10,
          28,
          43
        ],
        "statements": ["The player believes there might be a red key in box 3.",
 "The player knows that box 2 is empty.",
 "The player knows that box 3 is empty.",
 "The player believes that there is a red key in box 2.",
 "The player believes that box 1 might have a red key."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          1
        ],
        "length": 4
      },
      {
        "name": "7_2",
        "goal": 2,
        "images": [
          "stimuli/segments/p7_2_1.gif",
          "stimuli/segments/p7_2_2.gif",
          "stimuli/segments/p7_2_3.gif",
          "stimuli/segments/p7_2_4.gif",
        ],
        "times": [
          1,
          12,
          32,
          55
        ],
        "statements": ["The player knows that box 1 does not have the red key.",
 "The player believes that box number 2 holds the red key.",
 "The player believes that box 1 might have a red key.",
 "The player believes there might be a key in box 2.",
 "The player believes that box 2 is more likely to contain a red key than box 3."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 3
      },
      {
        "name": "7_3",
        "goal": 2,
        "images": [
          "stimuli/segments/p7_3_1.gif",
          "stimuli/segments/p7_3_2.gif",
          "stimuli/segments/p7_3_3.gif",
          "stimuli/segments/p7_3_4.gif",
          "stimuli/segments/p7_3_5.gif"
        ],
        "times": [
          1,
          13,
          26,
          32,
          52
        ],
        "statements": ["The player believes there might be a red key in box 3.",
 "The player believes that box 1 is empty.",
 "The player believes that box 2 would have a red key if box 3 is empty.",
 "The player believes there might be a key in box 2.",
 "The player knows that box 1 does not have the red key."],
        "relevant_colors": [
          "red"
        ],
        "relevant_boxes": [
          3
        ],
        "length": 4
      }
    ]
  }
)
