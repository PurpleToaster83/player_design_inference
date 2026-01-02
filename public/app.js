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
  function ExperimentController($scope, $timeout, $location, $interval, preloader) {
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

    $scope.button_disabled = false;
    $scope.countdown_time = 0;
    $scope.timer_active = false;
    $scope.statement_select = 0;
    $scope.qSeries = ["a", "b", "c"];

    $scope.data = {
      "user_id": NaN,
      "total_payment": 0,
      "total_reward": 0,
      "exam": NaN,
      "demographic_survey": NaN,
      "stimuli_set": {}
    }

    $scope.log = function(...args) {
      if ($location.search().debug == "true") {
        console.log(...args);
      }
    }

    $scope.store_to_db = function(key, val) {
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
      let n = cur_stim.statements[$scope.statement_select].length;
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
      $scope.valid_belief = $scope.response.beliefs.every(rating => 
        !isNaN(rating) && rating >= 1 && rating <= 100
      );
}

    $scope.validate_exam = function (ans) {
      $scope.exam_response = ans;
      $scope.valid_exam = true;
    }
    
    $scope.set_belief_statements = async function (stim_id) {
      let cur_stim = $scope.stimuli_set[stim_id];
      $scope.n_displayed_statements = cur_stim.statements[0].length;

      let n = cur_stim.statements[$scope.statement_select].length;
      let ids = Array.from(Array(n).keys());
      $scope.belief_statement_ids =
      $scope.array_sample(ids, $scope.n_displayed_statements);
      
      $scope.belief_statements = $scope.belief_statement_ids.map(id => cur_stim.statements[$scope.statement_select][id]);
      $scope.log("Belief statement IDs: " + $scope.belief_statement_ids);
      $scope.log("Belief statements: " + $scope.belief_statements);
    }

    $scope.reset_response = function () {
      // Ensure the beliefs array is properly sized
      const numStatements = $scope.belief_statements.length;
      $scope.response = {
        "beliefs": Array(numStatements).fill(50), // Initialize with 50 instead of NaN
        "belief_ids": $scope.belief_statement_ids
      };

      $timeout(function() {
          for (let i = 0; i < numStatements; i++) {
              $scope.updateSliderValuePosition(i, 50);
          }
      }, 100);
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
          $scope.data.demographic_survey = $scope.survey;
          $scope.increment_counter();
          $scope.store_to_db($scope.user_id, $scope.data);
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
          $scope.data.exam = exam_data;
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
          $scope.belief_statements = $scope.instructions[$scope.inst_id].statements[$scope.statement_select];
          let n = $scope.belief_statements.length;
          $scope.belief_statement_ids = Array.from(Array(n).keys());
        }
      }

      $scope.div = document.getElementById('ground_truth')
      // if ($scope.inst_id == 3) {
      //   $scope.div.innerHTML = "<br>Number of Potions: " + $scope.instructions[$scope.inst_id].numPotions + "<br><br>Number of Poisons: " + $scope.instructions[$scope.inst_id].numPoisons + "<br><br>";
      // }
      if ($scope.inst_id == 4 || $scope.inst_id == 7) {
          $scope.div.innerHTML = "";
          $scope.div.innerHTML += "<u>Here are the types of liquid in each flask:</u>" + "<br><br>";
          $scope.instructions[$scope.inst_id].ground_truth.forEach((element) => {
              $scope.div.innerHTML += element + "<br>";
          });
      }

      if ($scope.inst_id == 22) {
        $scope.disable_button_for_seconds(10);
      }
      
      $scope.reset_response();
      $scope.valid_belief = false;
      $scope.comprehension_response = "";
      $scope.valid_comprehension = false;
      $scope.exam_response = "";
      $scope.valid_exam = false;
    };

    $scope.disable_button_for_seconds = function (seconds) {
      if ($scope.countdownTimer) {
        $interval.cancel($scope.countdownTimer);
      }
      
      $scope.button_disabled = true;
      $scope.countdown_time = seconds;
      $scope.timer_active = true;
      
      $scope.countdownTimer = $interval(function() {
        $scope.countdown_time--;
        
        if ($scope.countdown_time <= 0) {
          $scope.countdown_time = 0;
          $scope.button_disabled = false;
          $scope.timer_active = false;
          $interval.cancel($scope.countdownTimer);
          $scope.countdownTimer = null;
        }
      }, 1000);
    };

    $scope.advance_stimuli = async function () {
      if ($scope.stim_id == $scope.stimuli_set.length) {
        // Advance to endscreen
        $scope.section = "endscreen"
        $scope.end_id = 0; 
        $scope.total_payment = ($scope.total_reward > 0) ? Math.round($scope.total_reward / 10) / 100 : 0;
        $scope.data.total_payment = $scope.total_payment;
        $scope.data.total_reward = $scope.total_reward;
      } else if ($scope.part_id < 0) {
        $scope.statement_select = Math.floor(Math.random() * $scope.stimuli_set[$scope.stim_id].statements.length);
        // Advance to first part
        $scope.part_id = $scope.part_id + 1;
        $scope.ratings = [];
        await $scope.set_belief_statements($scope.stim_id);
        start_time = (new Date()).getTime();
        if ($scope.part_id == 0) {
          $scope.disable_button_for_seconds(10);
        }
      } else if ($scope.part_id < $scope.stimuli_set[$scope.stim_id].length) {
        // Advance to next part
        if ($scope.part_id > 0) {
          var step_ratings = $scope.compute_ratings($scope.response);
          $scope.ratings = step_ratings;
          $scope.log(step_ratings);
          $scope.calc_stim_reward($scope.response);
          $scope.total_reward += $scope.stim_reward;
          $scope.div.innerHTML = "";
          $scope.div.innerHTML += "<u>These are the door key assignments:</u>" + "<br><br>";
          $scope.stimuli_set[$scope.stim_id].ground_truth.forEach((element) => {
              $scope.div.innerHTML += element + "<br>";
          });
        }
        $scope.part_id = $scope.part_id + 1;
        if ($scope.part_id == $scope.stimuli_set[$scope.stim_id].length) {
          // Store ratings
          $scope.data.stimuli_set[$scope.stimuli_set[$scope.stim_id].name + "_" + $scope.qSeries[$scope.statement_select]] = $scope.ratings;
          // Advance to next problem.
          $scope.part_id = -1;
          $scope.stim_id = $scope.stim_id + 1;
          if ($scope.stim_id < $scope.stimuli_set.length) {
            preloader.preloadImages($scope.stimuli_set[$scope.stim_id].images).then(
              function handleResolve(imglocs) { console.info("Preloaded next stimulus."); }); //TODO: this function is not working I think
          }
        }
      }
      $scope.reset_response();
      $scope.valid_belief = false;
    };

    $scope.compute_ratings = function (response) {
      rating = {
        "time_spent": ((new Date()).getTime() - start_time) / 1000.,
      }

      response.beliefs.forEach((act_rating, index) => {
        rating[$scope.belief_statement_ids[index]] = act_rating;
      });

      return rating;
    };

    $scope.style_statement = function (stmt) {
      return stmt
    }

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
      let count = await $scope.get_counter();
      stim_idx = $scope.stimuli_sets[count % $scope.stimuli_sets.length];  

      $scope.log("stimuli idx = " , stim_idx);
      for (i = 0; i < stim_idx.length; i++) {
        $scope.stimuli_set.push($scope.stimuli[stim_idx[i] - 1]);
      }
      $scope.stimuli_set = $scope.array_shuffle($scope.stimuli_set);
      $scope.log("stimuli ", $scope.stimuli_set);

      // Store stimuli set and user ID
      $scope.data.user_id = $scope.user_id;

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
        const unlock = $scope.stimuli_set[$scope.stim_id].calc_GT[$scope.statement_select][index];
        if (unlock == "y") {
          $scope.diff = 100 - belief;
        }
        else {
          $scope.diff = belief;
        }
        $scope.stim_reward += (-1 * $scope.diff) + 50;
      });
    }

    $scope.updateSliderValuePosition = function(index, value) {
        $timeout(function() {
            const sliderElement = document.querySelector(`#belief_rating_${index}`);
            const sliderValueElement = document.querySelector(`label[for="belief_rating_${index}"]`);
            
            if (sliderElement && sliderValueElement) {
                const sliderRect = sliderElement.getBoundingClientRect();
                const sliderWidth = sliderRect.width;
                
                const min = parseFloat(sliderElement.min) || 0;
                const max = parseFloat(sliderElement.max) || 100;
                const val = parseFloat(value);
                
                if (val === 0) {
                    sliderValueElement.style.left = '12.5px';
                    sliderValueElement.style.transform = 'translateX(-50%)';
                    return;
                }
                
                const thumbWidth = 25;
                const percentage = (val - min) / (max - min);
                
                const minPosition = thumbWidth / 2;
                const maxPosition = sliderWidth - thumbWidth / 2;
                const pixelPosition = minPosition + (percentage * (maxPosition - minPosition));
                
                sliderValueElement.style.left = `${pixelPosition}px`;
                sliderValueElement.style.transform = 'translateX(-50%)';
            }
        });
      $scope.validate_belief();
    };

    $scope.stimuli_sets = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
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
        text: `You're watching someone play a treasure game shown to the left.
              <br><br>
              There is one Adventurer <img class="caption-image" src="images/human.png"> whose goal is to collect one of the fruits <img class="caption-image" src="images/banana.png">, <img class="caption-image" src="images/berry.png">, <img class="caption-image" src="images/orange.png">.
              The player can only get exactly one fruit. The black tiles represent walls which cannot be passed through.
              The fruits may be locked behind doors <img class="caption-image" src="images/door.png">, which can only be unlocked with a specific key <img class="caption-image" src="images/key.png">.
              The keys can only be placed in purple trays <img class="caption-image" src="images/tray.png">.
              <br> <br>
              The doors and keys are all unique and labeled. A door can only be unlocked by a particular key. Some keys may unlock neither doors in the room.
              <br> <br>
              The adventurer does not know which keys unlock which doors. To help the adventurer more efficiently reach their goal, <strong>the game designer</strong>,
              who knows which keys unlock which doors, <strong>has arranged the keys strategically amoungst the purple trays.</strong>
              <br> <br>
              In this experiment, you are playing the role of the Adventurer.
              We will show you the map after the game designer has rearranged the keys, and ask you to match which key(s) corresponds to what door(s).
              Keys have the potential to unlock one, none, or multiple doors but can only be used once for each chamber map.
              <br> <br>

              Press the <strong>Next</strong> button to continue.


              `,
        image: "stimuli/segments/tutorial_b.png",
      }, 
      {
        text: `At each trial, we will show you the key placement and ask you questions about the <strong>which</strong> door each key unlocks.<br>
              <br>
              Rate <strong>100</strong> if you're <strong>certain</strong> that the key <strong>unlocks</strong> a <strong>door</strong>.<br>
              Rate <strong>50</strong> if you think there's an <strong>even, 50-50 chance</strong> whether the does or does not <strong>unlock</strong> a <strong>door</strong>.<br>
              Rate <strong>0</strong> if you're <strong>certain</strong> that the key <strong>does not unlock</strong> a <strong>door</strong>.<br>
              <br>
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
        statements: [["<strong>Key A</strong> unlocks <strong>Door 1</strong>"]],
        image: "stimuli/segments/tutorial1.png",
      },
      {
        image: "stimuli/segments/tutorial1.png",
        text: "In this case, Key A unlocks Door 1. This is because the room designer chose to place Key A close to Door 1 when they had a choice of placing it farther."
      },
      {
        text: `Now look at this map which has been slightly altered from the previous one. Think about how moving the Key to a different tray changed your judgment.
        <br><br><br>
        Press <strong>Next</strong> to continue.`,
        tutorial: true,
        image: "stimuli/segments/tutorial_b.png",

      },
      {
        text: `<br>`,
        tutorial: true,
        show_questions: true,
        question_types: ["beliefs"],
        statements: [["<strong>Key A</strong> unlocks <strong>Door 1</strong>"]],
        image: "stimuli/segments/tutorial2.png"
      },
      {
        image: "stimuli/segments/tutorial2.png",
        text: "In this case Key A unlocks Nothing! The room designer intentionally placed Key A far away from the agent to indicate it did not unlock the door."
      },
      {
        text: `As mentioned, you should assume that the room designer wants you to succeed as both of you will benefit if you answer correctly. The reward scheme is as follows:

              <br><br>
              For each question, Your rating will be compared to the answer key and rewards will be calibrated by considering the difference.

              <br><br>

              If the key does not unlock a door and you answer 100, you receive -50 points. If you answer 0, you receive 50 points. If you answer 50, you receive 0 points.
              <br><br>
              Similarly, if the key unlocks a door and you answer 100, you receive 50 points. If you answer 0, you receive -50 points. If you answer 50, you receive 0 points.

              <br><br>
              You accumulate the points you receive over all the maps you play and will be paid a bonus at the end of the experiment, at a rate of 1 USD per 1000 points.
              `
      },
      {
        text: `You've now finished the practice round and the Adventurer can search for fruits using the keys you've collected!`
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
        text: `<strong>Question 1/5:</strong> How many keys are needed to unlock a door?`,
        options: ["1",
                  "2",
                  "Depends on the door"],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 1/5:</strong> How many keys are needed to unlock a door?`,
        options: ["1",
                  "2",
                  "Depends on the door"],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 2/5:</strong> Which of the following statements is true?`,
        options: ["A key can be used to unlock any door",
                  "A key can only be used to unlock a specific door",
                  "A key can be used to unlock many doors"],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 2/5:</strong> Which of the following statements is true?`,
        options: ["A key can be used to unlock any door",
                  "A key can only be used to unlock a specific door",
                  "A key can be used to unlock many doors"],
        answer: 1,
        feedback: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following statements is true?`,
        options: ["The room designer placed the flasks randomly.",
                  "The room designer placed the keys in trays close to doors they can unlock.",
                  "The room designer placed the keys strategically amoung the key trays to help the player"],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following statements is true?`,
        options: ["The room designer placed the flasks randomly.",
                  "The room designer placed the keys in trays close to doors they can unlock.",
                  "The room designer placed the keys strategically amoung the key trays to help the player"],
        answer: 2,
        feedback: true
      },
      {
        text: `<strong>Question 4/5:</strong> Where can the room designer place the keys?`,
        options: ["Anywhere on the map.",
                  "ONLY on the trays.",
                  "ONLY next to a wall, the Adventurer, or the fruit."],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 4/5:</strong> Where can the room designer place the keys?`,
        options: ["Anywhere on the map.",
                  "ONLY on the trays.",
                  "ONLY next to a wall, the Adventurer, or the fruit."],
        answer: 1,
        feedback: true
      },
      {
        text: `<strong>Question 5/5:</strong> If the map has one key and there is only one tray and two doors, what conclusion can you draw?`,
        options: ["The key may or may not unlock any door",
                  "The key must unlock the closest door",
                  "The key can unlock both of them"],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 5/5:</strong> If the map has one key and there is only one tray and two doors, what conclusion can you draw?`,
        options: ["The key may or may not unlock any door",
                  "The key must unlock the closest door",
                  "The key can unlock both of them"],
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
               You will now play the game for 20 different rounds.
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
          "stimuli/segments/1_1_b.png",
          "stimuli/segments/1_1.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong> Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Nothing",
          "Key B unlocks Door 2"
        ],
        calc_GT: [
          [
            "n",
            "n",
          ],
          [
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "1_2",
        "images": [
          "stimuli/segments/1_2_b.png",
          "stimuli/segments/1_2.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 3</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 3</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
          "Key B unlocks Door 3"
        ],
        calc_GT: [
          [
            "y",
            "n",
            "n",
          ],
          [
            "n",
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "1_3",
        "images": [
          "stimuli/segments/1_3_b.png",
          "stimuli/segments/1_3.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Nothing",
          "Key B unlocks Door 2"
        ],
        calc_GT: [
          [
            "n",
            "n",
          ],
          [
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "1_4",
        "images": [
          "stimuli/segments/1_4_b.png",
          "stimuli/segments/1_4.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 3</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 3</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 2",
          "Key B unlocks Door 3"
        ],
        calc_GT: [
          [
            "n",
            "y",
            "n",
          ],
          [
            "n",
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "2_1",
        "images": [
          "stimuli/segments/2_1_b.png",
          "stimuli/segments/2_1.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
        ],
        calc_GT: [
          [
            "y",
            "n",
          ]
        ]
      },
      {
        "name": "2_2",
        "images": [
          "stimuli/segments/2_2_b.png",
          "stimuli/segments/2_2.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 2"
        ],
        calc_GT: [
          [
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "2_3",
        "images": [
          "stimuli/segments/2_3_b.png",
          "stimuli/segments/2_3.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 2"
        ],
        calc_GT: [
          [
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "2_4",
        "images": [
          "stimuli/segments/2_4_b.png",
          "stimuli/segments/2_4.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1"
        ],
        calc_GT: [
          [
            "y",
            "n",
          ]
        ]
      },
      {
        "name": "3_1",
        "images": [
          "stimuli/segments/3_1_b.png",
          "stimuli/segments/3_1.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 3</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 3</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks either Door 1 or Door 3",
          "Key B unlocks Door 2"
        ],
        calc_GT: [
          [
            "y",
            "n",
            "y",
          ],
          [
            "n",
            "y",
            "n",
          ]
        ]
      },
      {
        "name": "3_2",
        "images": [
          "stimuli/segments/3_2_b.png",
          "stimuli/segments/3_2.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 3</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 3</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
          "Key B unlocks Door 3"
        ],
        calc_GT: [
          [
            "y",
            "n",
            "n",
          ],
          [
            "n",
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "3_3",
        "images": [
          "stimuli/segments/3_3_b.png",
          "stimuli/segments/3_3.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 2",
          "Key B unlocks Nothing"
        ],
        calc_GT: [
          [
            "n",
            "y",
          ],
          [
            "n",
            "n",
          ],
        ]
      },
      {
        "name": "3_4",
        "images": [
          "stimuli/segments/3_4_b.png",
          "stimuli/segments/3_4.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
          "Key B unlocks Nothing"
        ],
        calc_GT: [
          [
            "y",
            "n",
          ],
          [
            "n",
            "n",
          ]
        ]
      },
      {
        "name": "4_1",
        "images": [
          "stimuli/segments/4_1_b.png",
          "stimuli/segments/4_1.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 2",
        ],
        calc_GT: [
          [
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "4_2",
        "images": [
          "stimuli/segments/4_2_b.png",
          "stimuli/segments/4_2.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
        ],
        calc_GT: [
          [
            "y",
            "n",
          ]
        ]
      },
      {
        "name": "4_3",
        "images": [
          "stimuli/segments/4_3_b.png",
          "stimuli/segments/4_3.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 3</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 3</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks either Door 2 or Door 3",
          "Key B unlocks Door 1",
        ],
        calc_GT: [
          [
            "n",
            "y",
            "n",
          ],
          [
            "n",
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "4_4",
        "images": [
          "stimuli/segments/4_4_b.png",
          "stimuli/segments/4_4.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 3</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 3</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks either Door 2 or Door 3",
          "Key B unlocks either Door 1 or Door 3",
        ],
        calc_GT: [
          [
            "n",
            "y",
            "n",
          ],
          [
            "y",
            "n",
            "n",
          ],
        ]
      },
      {
        "name": "5_1",
        "images": [
          "stimuli/segments/5_1_b.png",
          "stimuli/segments/5_1.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Nothing",
          "Key B unlocks Door 2"
        ],
        calc_GT: [
          [
            "n",
            "n",
          ],
          [
            "n",
            "y",
          ],
        ]
      },
      {
        "name": "5_2",
        "images": [
          "stimuli/segments/5_2_b.png",
          "stimuli/segments/5_2.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Nothing",
          "Key B unlocks Door 1"
        ],
        calc_GT: [
          [
            "n",
            "n",
          ],
          [
            "y",
            "n",
          ]
        ]
      },
      {
        "name": "5_3",
        "images": [
          "stimuli/segments/5_3_b.png",
          "stimuli/segments/5_3.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
          "Key B unlocks Door 2"
        ],
        calc_GT: [
          [
            "y",
            "n",
          ],
          [
            "n",
            "y",
          ]
        ]
      },
      {
        "name": "5_4",
        "images": [
          "stimuli/segments/5_4_b.png",
          "stimuli/segments/5_4.png"
        ],
        "times": [
          1,
          30,
          1
        ],
        "statements": [
          [
            "<strong>Key A</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key A</strong> unlocks <strong>Door 2</strong>",
          ],
          [
            "<strong>Key B</strong> unlocks <strong>Door 1</strong>",
            "<strong>Key B</strong> unlocks <strong>Door 2</strong>",
          ]
        ],
        "length": 2,
        ground_truth: [
          "Key A unlocks Door 1",
          "Key B unlocks Door 2"
        ],
        calc_GT: [
          [
            "y",
            "n",
          ],
          [
            "n",
            "y",
          ]
        ]
      },
    ]
  }
)