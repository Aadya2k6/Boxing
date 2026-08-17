with open('src/routes/onboarding.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

conflicts = []
in_conflict = False
part = 0
current_upstream = []
current_stashed = []

for line in lines:
    stripped = line.strip()
    if stripped.startswith('<<<<<<< Updated upstream'):
        in_conflict = True
        part = 1
        current_upstream = []
        current_stashed = []
        continue
    elif stripped.startswith('======='):
        part = 2
        continue
    elif stripped.startswith('>>>>>>> Stashed changes'):
        in_conflict = False
        conflicts.append({'upstream': ''.join(current_upstream), 'stashed': ''.join(current_stashed)})
        continue
    
    if in_conflict:
        if part == 1:
            current_upstream.append(line)
        elif part == 2:
            current_stashed.append(line)

out = ''
for i, c in enumerate(conflicts):
    out += f'--- CONFLICT {i+1} ---\nUPSTREAM:\n{c["upstream"]}\nSTASHED:\n{c["stashed"]}\n\n'

with open('conflicts.txt', 'w', encoding='utf-8') as f:
    f.write(out)
print(f'Wrote {len(conflicts)} conflicts to conflicts.txt')
