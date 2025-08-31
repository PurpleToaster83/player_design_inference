import json
import csv

file = "./JSONs/08_19_25.json"
flask_letters = ["A", "B", "C", "D"]
person_id = []
participants = 10

mturk_to_payment = {}

map_info = {}
for m in range(1, 4):
    for p in range(1, 5):
        map_info.update({f'{m}_{p}': {}})

with open(file, 'r') as file:
    raw_data = json.load(file)['results']

    for person in raw_data:
        mturk_to_payment.update({raw_data[person]['demographic_survey']['mturk_id']: {'payment': raw_data[person]['total_payment'], 'score': raw_data[person]['total_reward']}})

        person_id.append(person)
        person_data = raw_data[person]['stimuli_set']
        for i, map in enumerate(person_data):
            for f in range(len(person_data[map]) - 1):
                if not map_info[map].get(f'{flask_letters[f]}'):
                    map_info[map].update({f'{flask_letters[f]}': {
                        'answers': [],
                    }})
                    for p in range(participants):
                        map_info[map][f'{flask_letters[f]}'].update({f'person{p}': None})
                if map_info[map][f'{flask_letters[f]}'].get('answers'):
                    map_info[map][f'{flask_letters[f]}']['answers'].extend([person_data[map][f'{f}']])
                else:
                    map_info[map][f'{flask_letters[f]}']['answers'] = [person_data[map][f'{f}']]

                idx = person_id.index(person)
                map_info[map][f'{flask_letters[f]}'][f'person{idx}'] = person_data[map][f'{f}']
    for map in map_info.items():
        for flask in map[1].items():
            sum = 0
            for element in flask[1]['answers']:
                sum += element
            map_info[map[0]].update({f'{flask[0]}': {
                'sum': sum,
                '# answers': len(flask[1]['answers']),
                'avg': (sum / len(flask[1]['answers'])),
            }})
            for p in range(participants):
                map_info[map[0]][f'{flask[0]}'].update({f'person{p}': flask[1][f'person{p}']})

ground_truth = {
    "1_1": ["A is a Poison"],
    "1_2": ["A is a Potion"],
    "1_3": ["A is a Poison"],
    "1_4": ["A is a Potion"],
    "2_1": ["A is a Potion", "B is a Poison"],
    "2_2": ["A is a Poison", "B is a Poison"],
    "2_3": ["A is a Potion", "B is a Poison"],
    "2_4": ["A is a Potion", "B is a Potion"],
    "3_1": ["A is a Poison", "B is a Poison"],
    "3_2": ["A is a Poison", "B is a Poison"],
    "3_3": ["A is a Potion", "B is a Potion", "C is a Potion"],
    "3_4": ["A is a Potion", "B is a Poison", "C is a Potion"]
}

with open('08_19_25_data.csv', 'w', newline='') as csvfile:
    fieldnames = ["Map", "Flask"]
    for p in range(participants):
        fieldnames.append(f'Person{p}')
    fieldnames.append("Avg")
    fieldnames.append("GroundTruth")
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    
    for name, map in map_info.items():
        for id, flask in map.items():
            gt = ground_truth[name][flask_letters.index(id)]
            if gt == f'{id} is a Potion':
                val = 100
            else:
                val = 0
            cur_info = {
                'Map': name,
                'Flask': id,
                'Avg': map[id]['avg'],
                'GroundTruth': val
            }
            for p in range(participants):
                cur_info.update({f'Person{p}': map[id][f'person{p}']})
            writer.writerow(cur_info)

with open('08_19_25_payments.csv', 'w', newline='') as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=["mturk_id", "payment", "score"])
    writer.writeheader()
    for person in mturk_to_payment.items():
        info = {
            "mturk_id": person[0],
            "payment": person[1]['payment'],
            "score": person[1]['score']
        }
        writer.writerow(info)
