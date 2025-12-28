import json
import csv

file = "12_24_25.json"
person_id = []
participants = 5

ground_truth = {
    "1_1_a": ["n", "n", "y"],
    "1_1_b": ["n", "y", "n"],
    "1_2_a": ["y", "n", "n", "n"],
    "1_2_b": ["n", "n", "y", "n"],
    "1_3_a": ["n", "n", "y"],
    "1_3_b": ["n", "y", "n"],
    "1_4_a": ["n", "y", "n", "n"],
    "1_4_b": ["n", "n", "y", "n"],
    "2_1_a": ["y", "n", "n"],
    "2_2_a": ["n", "y", "n"],
    "2_3_a": ["n", "y", "n"],
    "2_4_a": ["y", "n", "n"],
    "3_1_a": ["y", "n", "y", "n"],
    "3_1_b": ["n", "y", "n", "n"],
    "3_2_a": ["y", "n", "n", "n"],
    "3_2_b": ["n", "n", "y", "n"],
    "3_3_a": ["n", "y", "n"],
    "3_3_b": ["n", "n", "y"],
    "3_4_a": ["y", "n", "n"],
    "3_4_b": ["n", "n", "y"],
    "4_1_a": ["n", "y", "n"],
    "4_2_a": ["y", "n", "n"],
    "4_3_a": ["n", "y", "n", "n"],
    "4_3_b": ["n", "n", "y", "n"],
    "4_4_a": ["n", "y", "n", "n"],
    "4_4_b": ["y", "n", "n", "n"],
    "5_1_a": ["n", "n", "y"],
    "5_1_b": ["n", "y", "n"],
    "5_2_a": ["n", "n", "y"],
    "5_2_b": ["y", "n", "n"],
    "5_3_a": ["y", "n", "n"],
    "5_3_b": ["n", "y", "y"],
    "5_4_a": ["y", "n", "n"],
    "5_4_b": ["n", "y", "n"]
}
mturk_to_payment = {}
statements = {
    'a': ["Key A unlocks Door 1",
     "Key A unlocks Door 2",
     "Key A unlocks Door 3",
     "Ket A unlocks Nothing"],
    'b': ["Key B unlocks Door 1",
     "Key B unlocks Door 2",
     "Key B unlocks Door 3",
     "Key B unlocks Nothing"]
}


map_info = {}
for map_name in ground_truth:
    map_info.update({map_name: {}})


with open(file, 'r') as file:
    raw_data = json.load(file)['results']

    for person in raw_data:
        mturk_to_payment.update({raw_data[person]['demographic_survey']['mturk_id']: {'payment': raw_data[person]['total_payment'], 'score': raw_data[person]['total_reward']}})

        person_id.append(person)
        person_data = raw_data[person]['stimuli_set']
        for i, map in enumerate(person_data):
            for f in range(len(person_data[map]) - 1):
                if not map_info[map].get(f'{f}'): #fundementally different
                    map_info[map].update({f'{f}': {
                        'answers': [],
                    }})
                    for p in range(participants):
                        map_info[map][f'{f}'].update({f'person{p}': None})
                if map_info[map][f'{f}'].get('answers'):
                    map_info[map][f'{f}']['answers'].extend([person_data[map][f'{f}']])
                else:
                    map_info[map][f'{f}']['answers'] = [person_data[map][f'{f}']]

                idx = person_id.index(person)
                map_info[map][f'{f}'][f'person{idx}'] = person_data[map][f'{f}']
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

print('blah')

with open('12_24_25_data.csv', 'w', newline='') as csvfile:
    fieldnames = ["Map", "Statement"]
    for p in range(participants):
        fieldnames.append(f'Person{p}')
    fieldnames.append("Avg")
    fieldnames.append("GroundTruth")
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    
    for name, map in map_info.items():
        for id, flask in map.items():
            gt = ground_truth[name][int(id)]
            if gt == "y":
                val = 100
            else:
                val = 0
            cur_info = {
                'Map': name,
                'Statement': statements[name[-1]][int(id)],
                'Avg': map[id]['avg'],
                'GroundTruth': val
            }
            for p in range(participants):
                cur_info.update({f'Person{p}': map[id][f'person{p}']})
            writer.writerow(cur_info)

with open('12_24_25_payments.csv', 'w', newline='') as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=["mturk_id", "payment", "score"])
    writer.writeheader()
    for person in mturk_to_payment.items():
        info = {
            "mturk_id": person[0],
            "payment": person[1]['payment'],
            "score": person[1]['score']
        }
        writer.writerow(info)

print('blah')