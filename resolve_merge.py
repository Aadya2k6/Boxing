with open('src/routes/onboarding.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_conflict = False
part = 0
current_upstream = []
current_stashed = []
conflict_idx = 0

for line in lines:
    stripped = line.strip()
    if stripped.startswith('<<<<<<< Updated upstream'):
        in_conflict = True
        part = 1
        current_upstream = []
        current_stashed = []
        conflict_idx += 1
        continue
    elif stripped.startswith('======='):
        part = 2
        continue
    elif stripped.startswith('>>>>>>> Stashed changes'):
        in_conflict = False
        
        # Resolve logic here
        if conflict_idx == 1:
            pass # we'll fix this manually after
        elif conflict_idx in [2, 3, 4, 5, 6, 11, 12, 15]:
            new_lines.extend(current_upstream)
        elif conflict_idx == 7:
            new_lines.append('        <div className="grid md:grid-cols-2 gap-6">\n')
            new_lines.append('          <Field label="Full name" required hint="As per official government ID">\n')
            new_lines.append('            <CinematicInput value={data.fullName || ""} onChange={e => set("fullName", e.target.value)} placeholder="Aarav Mehta" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Date of birth" required hint="Used to verify age category and minor status">\n')
            new_lines.append('            <CinematicInput type="date" value={data.dob || ""} onChange={e => set("dob", e.target.value)} />\n')
        elif conflict_idx == 8:
            new_lines.append('          <Field label="Email address" required hint="Used to access your athlete dashboard">\n')
            new_lines.append('            <CinematicInput type="email" value={data.email || ""} onChange={e => set("email", e.target.value)} placeholder="aarav@example.com" />\n')
        elif conflict_idx == 9:
            new_lines.append('            <CinematicInput value={data.country || "India"} onChange={e => set("country", e.target.value)} placeholder="e.g. India" />\n')
        elif conflict_idx == 10:
            new_lines.append('      <div className="space-y-6">\n')
            new_lines.append('        <div className="flex items-start gap-4 p-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20">\n')
            new_lines.append('          <AlertCircle className="size-5 text-[#F59E0B] mt-0.5 shrink-0" />\n')
            new_lines.append('          <p className="text-sm text-[#F59E0B] leading-relaxed">Participant is under 18 years of age. A parent or legal guardian must provide contact details and consent.</p>\n')
            new_lines.append('        </div>\n')
            new_lines.append('        <div className="grid md:grid-cols-2 gap-6">\n')
            new_lines.append('          <Field label="Guardian Full Name" required>\n')
            new_lines.append('            <CinematicInput value={data.gName || ""} onChange={e => set("gName", e.target.value)} placeholder="Guardian Name" />\n')
        elif conflict_idx == 13:
            new_lines.append('        <div className="grid md:grid-cols-2 gap-6">\n')
            new_lines.append('          <Field label="Emergency Contact Name" required>\n')
            new_lines.append('            <CinematicInput value={data.eName || ""} onChange={e => set("eName", e.target.value)} placeholder="Contact Name" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Relationship" required>\n')
            new_lines.append('            <CinematicInput value={data.eRel || ""} onChange={e => set("eRel", e.target.value)} placeholder="e.g. Parent, Spouse, Sibling" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Emergency Contact Phone" required>\n')
            new_lines.append('            <CinematicInput type="tel" value={data.ePhone || ""} onChange={e => set("ePhone", e.target.value)} placeholder="+91 98765 43210" />\n')
        elif conflict_idx == 14:
            new_lines.append('        <div className="grid md:grid-cols-2 gap-6 pt-2">\n')
            new_lines.append('          <Field label="Current Medications" hint="Any daily or routine prescriptions (Optional)">\n')
            new_lines.append('            <Textarea value={data.meds || ""} onChange={e => set("meds", e.target.value)} placeholder="e.g. Inhaler as needed or None" rows={2} />\n')
        elif conflict_idx == 16:
            new_lines.append('        <div className="grid md:grid-cols-2 gap-6">\n')
            new_lines.append('          <Field label="Boxing Stance" required hint="Your primary fighting stance">\n')
        elif conflict_idx == 17:
            new_lines.append('          <Field label="Weight Category" required hint={!data.ageCategoryId ? "Select an Age Category first" : "Your current weight class"}>\n')
            new_lines.append('            <Select value={data.weightCategoryId || ""} onChange={e => set("weightCategoryId", e.target.value)} disabled={!data.ageCategoryId}>\n')
            new_lines.append('              <option value="">Select Weight Category…</option>\n')
            new_lines.append('              {filteredWeightCategories.map(w => (\n')
            new_lines.append('                <option key={w.id} value={w.id}>\n')
            new_lines.append('                  {w.name} ({w.min_kg}kg {w.max_kg ? `- ${w.max_kg}kg` : "+"})\n')
            new_lines.append('                </option>\n')
            new_lines.append('              ))}\n')
            new_lines.append('            </Select>\n')
            new_lines.append('          </Field>\n')
            new_lines.append('\n')
        elif conflict_idx == 18:
            new_lines.append('          <Field label="Height (cm)" required hint="Standing height">\n')
            new_lines.append('            <CinematicInput type="number" step="0.5" value={data.heightCm || ""} onChange={e => set("heightCm", e.target.value)} placeholder="e.g. 178" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Reach (cm)" hint="Fingertip-to-fingertip wingspan (Optional)">\n')
            new_lines.append('            <CinematicInput type="number" step="0.5" value={data.reachCm || ""} onChange={e => set("reachCm", e.target.value)} placeholder="e.g. 182" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Experience Level" required>\n')
            new_lines.append('            <Select value={data.experienceLevel || ""} onChange={e => set("experienceLevel", e.target.value)}>\n')
            new_lines.append('              <option value="">Select…</option>\n')
            new_lines.append('              <option value="Beginner">Beginner (No prior experience)</option>\n')
            new_lines.append('              <option value="Intermediate">Intermediate (Pad work and heavy bag experience)</option>\n')
            new_lines.append('              <option value="Advanced">Advanced (Sparring or competition experience)</option>\n')
            new_lines.append('            </Select>\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Amateur / Fight Record" hint="Optional (Wins-Losses-Draws)">\n')
            new_lines.append('            <CinematicInput value={data.fightRecord || ""} onChange={e => set("fightRecord", e.target.value)} placeholder="e.g. 3-1-0 or N/A" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Previous/Current Club" hint="Optional">\n')
            new_lines.append('            <CinematicInput value={data.previousClub || ""} onChange={e => set("previousClub", e.target.value)} placeholder="e.g. Kronk Gym" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Coach Name" hint="Optional">\n')
            new_lines.append('            <CinematicInput value={data.coachName || ""} onChange={e => set("coachName", e.target.value)} placeholder="Coach Name" />\n')
            new_lines.append('          </Field>\n')
            new_lines.append('          <Field label="Preferred Class Schedule & Time Slots" hint="Optional">\n')
            new_lines.append('            <CinematicInput value={data.preferredClassSchedule || ""} onChange={e => set("preferredClassSchedule", e.target.value)} placeholder="e.g. Weekdays Evening, Weekends Morning" />\n')
            new_lines.append('          </Field>\n')
        continue
    
    if in_conflict:
        if part == 1:
            current_upstream.append(line)
        elif part == 2:
            current_stashed.append(line)
    else:
        new_lines.append(line)

content = "".join(new_lines)

# Fix Conflict 1 (it's the FormPanel and CinematicLayout closing tags)
# Replace the block right before the conflict 1 that had missing props.
import re
content = re.sub(
    r'<FormPanel\s+current={current}\s+step={step}\s+totalSteps={totalSteps}\s+data={data}\s+set={set}\s+user={user}\s+onPrev=',
    '<FormPanel\\n                current={current}\\n                step={step}\\n                totalSteps={totalSteps}\\n                data={data}\\n                set={set}\\n                user={user}\\n                isMinor={isMinor}\\n                ageCategories={ageCategories}\\n                weightCategories={weightCategories}\\n                onPrev=',
    content, count=1)

# Also fix the `Input` for `Declared Weight` to be `CinematicInput`
content = content.replace(
    """          <Field label="Declared Weight (kg)" required hint="Used for weight category assignment">
            <Input type="number" step="0.1" value={data.weightKg || ""} onChange={e => set("weightKg", e.target.value)} placeholder="e.g. 71.5" />
          </Field>""",
    """          <Field label="Declared Weight (kg)" required hint="Used for weight category assignment">
            <CinematicInput type="number" step="0.1" value={data.weightKg || ""} onChange={e => set("weightKg", e.target.value)} placeholder="e.g. 71.5" />
          </Field>""")

with open('src/routes/onboarding.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Merge resolved. Total conflicts processed: {conflict_idx}")
