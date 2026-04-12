"""Default summary templates shipped with OpenHiNotes.

Each template is a dict with: name, category, description, prompt_template,
and optionally target_type ("record" | "whisper" | "both", default "both").
The prompt_template uses {{transcript}} as placeholder and follows a hybrid style:
short instruction + required Markdown sections — the LLM infers the rest.
"""

DEFAULT_TEMPLATES: list[dict] = [
    # ──────────────────────────────────────────────
    # GENERAL / UNIVERSAL
    # ──────────────────────────────────────────────
    {
        "name": "General Meeting",
        "category": "General",
        "target_type": "record",
        "description": "All-purpose meeting summary with outline, key decisions, and action items.",
        "prompt_template": (
            "Summarize the following meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Location | Attendees (extract from transcript)\n\n"
            "## 📒 Meeting Outline\n"
            "Group by topic. For each topic, list subtopics with a one-line summary.\n\n"
            "## 📋 Key Takeaways\n"
            "Concise conclusions from each topic discussed.\n\n"
            "## 🎯 Action Items\n"
            "| Owner | Task | Deadline |\n|---|---|---|\n"
            "Extract every action item with responsible person and due date if mentioned.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Weekly Team Meeting",
        "category": "General",
        "target_type": "record",
        "description": "Capture milestones, project updates, goals, and team feedback from weekly syncs.",
        "prompt_template": (
            "Summarize this weekly team meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Location | Attendees\n\n"
            "## 🎯 Team Milestones & Progress\n"
            "Group updates by topic/project. Highlight what was achieved this week.\n\n"
            "## 📋 Key Takeaways\n"
            "Main conclusions and decisions.\n\n"
            "## 🔄 Upcoming Goals\n"
            "What the team plans to accomplish next week.\n\n"
            "## ✅ Action Items\n"
            "| Owner | Task | Deadline |\n|---|---|---|\n\n"
            "## 🤝 Team Feedback\n"
            "Any feedback, concerns, or morale notes shared.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Daily Standup",
        "category": "General",
        "target_type": "record",
        "description": "Quick daily updates: done, planned, and blockers per team member.",
        "prompt_template": (
            "Summarize this daily standup meeting.\n\n"
            "Use this structure:\n\n"
            "## 📝 Standup — [extract date]\n"
            "Participants: [extract names]\n\n"
            "## 🧑‍💼 Individual Updates\n"
            "For each speaker, list:\n"
            "- **Completed**: tasks done since last standup\n"
            "- **Planned**: tasks for today\n"
            "- **Blockers**: anything blocking progress\n\n"
            "## 🔄 Cross-Team Dependencies\n"
            "Items requiring coordination between team members.\n\n"
            "## 🎯 Action Items\n"
            "| Owner | Task | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # 1-ON-1 / HR
    # ──────────────────────────────────────────────
    {
        "name": "1-to-1 Meeting",
        "category": "HR",
        "target_type": "record",
        "description": "Captures priorities, achievements, challenges, feedback, and growth goals from 1-on-1s.",
        "prompt_template": (
            "Summarize this 1-on-1 meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Attendees\n\n"
            "## 💭 Top of Mind\n"
            "Key topics the participants wanted to discuss.\n\n"
            "## 🏆 Achievements & Updates\n"
            "Progress and accomplishments since the last 1-on-1.\n\n"
            "## 🚧 Challenges & Blockers\n"
            "Issues encountered, support needed.\n\n"
            "## 🖇️ Mutual Feedback\n"
            "Feedback exchanged between both parties.\n\n"
            "## 📖 Personal Growth\n"
            "Development goals, learning, career aspirations discussed.\n\n"
            "## 🎯 Next Milestones\n"
            "Agreed next steps and goals.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Job Interview",
        "category": "HR",
        "target_type": "record",
        "description": "Structured interview summary: background, experience, strengths, Q&A, and next steps.",
        "prompt_template": (
            "Summarize this job interview transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Interview Details\n"
            "Date & Time: {{meeting_date}} | Position Applied | Interviewer(s) | Candidate\n\n"
            "## 🙋 Self-Introduction\n"
            "Candidate's background summary.\n\n"
            "## 💼 Work Experience\n"
            "For each role: company, responsibilities, reason for leaving.\n\n"
            "## 💰 Salary Expectations\n"
            "If mentioned.\n\n"
            "## 🌟 Strengths & Weaknesses\n"
            "As discussed or observed.\n\n"
            "## 💬 Q&A Highlights\n"
            "Key questions asked and candidate's answers.\n\n"
            "## 🎯 Next Steps\n"
            "Follow-up actions, decisions, timeline.\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # CLIENT / SALES / BUSINESS
    # ──────────────────────────────────────────────
    {
        "name": "Business Call",
        "category": "Client & Sales",
        "target_type": "record",
        "description": "Captures call discussion, agreements, unresolved issues, and next arrangements.",
        "prompt_template": (
            "Summarize this business call transcript.\n\n"
            "Use this structure:\n\n"
            "## 📞 Call Information\n"
            "Date & Time: {{meeting_date}} | Attendees\n\n"
            "## 📝 Summary\n"
            "High-level overview of the conversation.\n\n"
            "## 💬 Discussion Topics\n"
            "For each topic: title and detailed description.\n\n"
            "## 🤝 Agreements & Outstanding Matters\n"
            "- **Agreed Terms**: resolved items\n"
            "- **Unresolved Issues**: items still open\n"
            "- **Mutual Needs**: what each party needs from the other\n\n"
            "## 📅 Next Steps\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Client Meeting",
        "category": "Client & Sales",
        "target_type": "record",
        "description": "Summarizes client discussions, feedback, action items, and follow-ups.",
        "prompt_template": (
            "Summarize this client meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Client Name | Attendees | Purpose of Meeting\n\n"
            "## 💬 Discussion Points\n"
            "Up to 7 topics in chronological order. For each: a concise title, "
            "then detailed points including arguments, data, questions, and conclusions.\n\n"
            "## 🗣️ Client Feedback\n"
            "Key feedback from the client.\n\n"
            "## 🎯 Action Items\n"
            "| Task | Responsible | Due Date |\n|---|---|---|\n\n"
            "## 🔜 Follow-Up & Next Steps\n"
            "Agreed follow-ups and next meeting plans.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Sales Call",
        "category": "Client & Sales",
        "target_type": "record",
        "description": "Captures client needs, pitch messages, reactions, and follow-up plan for sales reps.",
        "prompt_template": (
            "Summarize this sales call transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Client Information\n"
            "Client Name | Company | Date & Time: {{meeting_date}}\n\n"
            "## 🧠 Key Client Needs & Pain Points\n"
            "Core challenges, goals, or unmet needs identified.\n\n"
            "## 🎯 Pitch Messages\n"
            "Key selling points tailored to the client's situation.\n\n"
            "## 💬 Client Reactions & Questions\n"
            "Notable feedback, interest level, concerns, or objections raised.\n\n"
            "## 📅 Follow-Up Plan\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Customer Onboarding",
        "category": "Client & Sales",
        "target_type": "record",
        "description": "Tracks onboarding progress, goals, risks, and next steps for new customers.",
        "prompt_template": (
            "Summarize this customer onboarding meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Location | Facilitator | Participants | Phase\n\n"
            "## 🎯 Onboarding Goals\n"
            "Main objectives the customer wants to achieve.\n\n"
            "## ✅ Coverage & Use Cases\n"
            "Features and workflows covered or discussed during this session.\n\n"
            "## ⚠️ Risks & Issues\n"
            "Current blockers, concerns, or open questions.\n\n"
            "## 🔜 Next Steps\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # PROJECT MANAGEMENT
    # ──────────────────────────────────────────────
    {
        "name": "Project Kickoff",
        "category": "Project Management",
        "target_type": "record",
        "description": "Outlines project goals, scope, roles, timeline, risks, and action plan.",
        "prompt_template": (
            "Summarize this project kickoff meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Kickoff Details\n"
            "Date & Time: {{meeting_date}} | Project Name | Location | Attendees | Sponsor\n\n"
            "## 🎯 Project Overview & Goals\n"
            "Purpose, business value, and strategic fit.\n\n"
            "## 📐 Scope & Deliverables\n"
            "- **In Scope**: agreed items\n"
            "- **Out of Scope**: notable exclusions\n\n"
            "## 📅 Timeline & Milestones\n"
            "| Phase / Milestone | Date |\n|---|---|\n\n"
            "## 👥 Roles & Responsibilities\n"
            "| Role | Person |\n|---|---|\n\n"
            "## ⚠️ Risks & Assumptions\n"
            "| Risk | Mitigation |\n|---|---|\n\n"
            "## 📋 Action Plan\n"
            "| Owner | Task | Due Date |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Project Status Update",
        "category": "Project Management",
        "target_type": "record",
        "description": "Regular project meeting: status, completed/pending tasks, blockers, and actions.",
        "prompt_template": (
            "Summarize this project status meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Project Name | Attendees\n\n"
            "## 📊 Project Status\n"
            "Current overall status summary.\n\n"
            "## ✅ Completed Tasks\n"
            "Tasks finished since last meeting.\n\n"
            "## ⏳ Pending Tasks\n"
            "Tasks in progress with updates.\n\n"
            "## 🚧 Blocking Issues\n"
            "Issues blocking progress and proposed resolutions.\n\n"
            "## 💬 Discussion Points\n"
            "Key topics discussed (up to 7, chronological order).\n\n"
            "## 🎯 Action Items\n"
            "| Task | Responsible | Due Date |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Sprint Planning",
        "category": "Project Management",
        "target_type": "record",
        "description": "Sprint goals, backlog review, capacity, and task assignments for agile teams.",
        "prompt_template": (
            "Summarize this sprint planning meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📋 Sprint Info\n"
            "Sprint Name/Goal | Dates | Team | Scrum Master | Participants\n\n"
            "## 🔄 Backlog Review\n"
            "Prioritized items from the backlog discussed.\n\n"
            "## ⏳ Carryover from Previous Sprint\n"
            "Incomplete tasks carried over.\n\n"
            "## 📊 Team Capacity\n"
            "Capacity assessment and any constraints.\n\n"
            "## 🚀 Sprint Backlog\n"
            "User stories and tasks committed for this sprint.\n\n"
            "## ❓ Open Questions\n"
            "Unresolved issues needing clarification.\n\n"
            "## 🚧 Risks & Blockers\n"
            "Potential challenges for the sprint.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Retrospective",
        "category": "Project Management",
        "target_type": "record",
        "description": "What went well, what didn't, improvements, and action items from retros.",
        "prompt_template": (
            "Summarize this retrospective meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Retro Details\n"
            "Date & Time: {{meeting_date}} | Sprint/Project | Attendees\n\n"
            "## ✅ What Went Well\n"
            "Positive highlights and successes.\n\n"
            "## ❌ What Didn't Go Well\n"
            "Challenges, issues, and frustrations.\n\n"
            "## 💡 Improvements\n"
            "Specific improvements suggested or agreed upon.\n\n"
            "## 🎯 Action Items\n"
            "| Task | Responsible | Due Date |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # LEADERSHIP / STAKEHOLDERS
    # ──────────────────────────────────────────────
    {
        "name": "Stakeholder Meeting",
        "category": "Leadership",
        "target_type": "record",
        "description": "High-level review: business updates, financials, metrics, decisions, and next steps.",
        "prompt_template": (
            "Summarize this stakeholder meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Attendees | Stakeholders\n\n"
            "## 📊 Business / Project Review\n"
            "High-level status summary.\n\n"
            "## 💰 Financial Updates\n"
            "Revenue, costs, profit margins, budget status (if discussed).\n\n"
            "## 📈 Key Metrics\n"
            "Metrics and KPIs shared.\n\n"
            "## 💬 Discussion Points\n"
            "Up to 7 key topics in chronological order, with detailed points.\n\n"
            "## 🧑‍💼 Decisions Made\n"
            "Decisions and their rationale.\n\n"
            "## 🎯 Action Items\n"
            "| Task | Responsible | Due Date |\n|---|---|---|\n\n"
            "## 🔜 Next Steps\n"
            "Agreed next steps.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Board Meeting",
        "category": "Leadership",
        "target_type": "record",
        "description": "Executive-level: agenda items, KPIs, decisions, and strategic next steps.",
        "prompt_template": (
            "Summarize this board meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Location | Chairperson | Board Members\n\n"
            "## 🗂️ Agenda Items\n"
            "For each agenda item: title and detailed record of discussion.\n\n"
            "## 📊 Key Performance\n"
            "- **Financial**: revenue, costs, profit margins\n"
            "- **Operational**: efficiency, productivity\n"
            "- **Customer**: retention, market share, satisfaction\n\n"
            "## 🧑‍💼 Decisions & Action Items\n"
            "For each decision: description, rationale, responsible person, deadline.\n\n"
            "## 📅 Next Steps\n"
            "Strategic next steps agreed upon.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "All Hands Meeting",
        "category": "Leadership",
        "target_type": "record",
        "description": "Company-wide updates, announcements, key decisions, and Q&A highlights.",
        "prompt_template": (
            "Summarize this all-hands meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Location | Host | Key Attendees\n\n"
            "## 📝 Meeting Overview\n"
            "Brief description of the meeting's purpose and key objectives.\n\n"
            "## 📋 Key Topics\n"
            "For each topic: summary of discussion and key decisions or insights.\n\n"
            "## 🔑 Decisions & Action Items\n"
            "Decisions made and follow-up actions with responsible parties.\n\n"
            "## 💬 Q&A Highlights\n"
            "Notable questions and their answers.\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # SECURITY / PENTEST
    # ──────────────────────────────────────────────
    {
        "name": "Pentest Kickoff",
        "category": "Security",
        "target_type": "record",
        "description": "Pentest engagement kickoff: scope, rules of engagement, targets, timeline, and contacts.",
        "prompt_template": (
            "Summarize this penetration testing kickoff meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Engagement Details\n"
            "Date & Time: {{meeting_date}} | Client | Attendees | Engagement Type (black-box / grey-box / white-box)\n\n"
            "## 🎯 Scope & Targets\n"
            "- **In-scope**: IP ranges, domains, applications, environments\n"
            "- **Out-of-scope**: systems, networks, or actions explicitly excluded\n\n"
            "## 📜 Rules of Engagement\n"
            "Testing hours, allowed techniques, escalation procedures, "
            "emergency contacts, data handling requirements.\n\n"
            "## 🔑 Access & Credentials\n"
            "Accounts, VPN details, or access methods provided (reference only, no secrets).\n\n"
            "## 📅 Timeline & Milestones\n"
            "| Phase | Dates |\n|---|---|\n\n"
            "## 👥 Points of Contact\n"
            "| Role | Name | Contact |\n|---|---|---|\n\n"
            "## ⚠️ Risks & Assumptions\n"
            "Known risks, assumptions, and prerequisites.\n\n"
            "## 🎯 Action Items\n"
            "| Task | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Pentest Weekly Status",
        "category": "Security",
        "target_type": "record",
        "description": "Weekly pentest progress: findings so far, blockers, risk highlights, and next targets.",
        "prompt_template": (
            "Summarize this weekly pentest status meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Status Update\n"
            "Date | Engagement Name | Week # | Attendees\n\n"
            "## 📊 Progress Summary\n"
            "What was tested this week, completion percentage, areas covered.\n\n"
            "## 🔴 Findings Highlights\n"
            "Critical or high-severity findings discovered this week. "
            "For each: title, severity, affected asset, brief description.\n\n"
            "## 🚧 Blockers & Issues\n"
            "Access issues, environment problems, scope questions.\n\n"
            "## 🔜 Next Week Plan\n"
            "Targets and techniques planned for next week.\n\n"
            "## 🎯 Action Items\n"
            "| Task | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Pentest Debrief",
        "category": "Security",
        "target_type": "record",
        "description": "Post-engagement debrief: key findings, risk summary, remediation priorities, and next steps.",
        "prompt_template": (
            "Summarize this penetration test debrief meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Debrief Details\n"
            "Date | Engagement Name | Client | Attendees\n\n"
            "## 📋 Engagement Summary\n"
            "Scope covered, methodology used, overall assessment.\n\n"
            "## 🔴 Critical & High Findings\n"
            "For each: title, severity, affected asset, business impact, recommended fix.\n\n"
            "## 🟡 Medium & Low Findings\n"
            "Summary of remaining findings.\n\n"
            "## 📊 Risk Overview\n"
            "Overall risk posture and key risk themes.\n\n"
            "## 🛠️ Remediation Priorities\n"
            "Ordered list of recommended remediation actions.\n\n"
            "## 🎯 Next Steps\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n"
            "Retest timeline, report delivery date, follow-up meetings.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Security Incident Review",
        "category": "Security",
        "target_type": "record",
        "description": "Post-incident review: timeline, root cause, impact, lessons learned, and remediation.",
        "prompt_template": (
            "Summarize this security incident review meeting transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Incident Details\n"
            "Date | Incident ID/Name | Severity | Attendees\n\n"
            "## 📋 Incident Timeline\n"
            "Chronological events from detection to resolution.\n\n"
            "## 🔍 Root Cause Analysis\n"
            "What happened and why.\n\n"
            "## 💥 Impact Assessment\n"
            "Systems affected, data exposed, business impact, duration.\n\n"
            "## ✅ Response Actions Taken\n"
            "Containment, eradication, and recovery steps performed.\n\n"
            "## 💡 Lessons Learned\n"
            "What worked, what didn't, process improvements.\n\n"
            "## 🎯 Remediation Plan\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # BRAINSTORMING / CREATIVE
    # ──────────────────────────────────────────────
    {
        "name": "Brainstorming Session",
        "category": "General",
        "target_type": "record",
        "description": "Captures ideas generated, key themes, and actionable takeaways from brainstorms.",
        "prompt_template": (
            "Summarize this brainstorming session transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Session Details\n"
            "Date & Time: {{meeting_date}} | Location | Participants\n\n"
            "## 💬 Objectives\n"
            "What the brainstorm aimed to explore or solve.\n\n"
            "## 🧠 Ideas Generated\n"
            "List all ideas discussed, grouped by theme if possible. "
            "For each: brief description and any pros/cons mentioned.\n\n"
            "## 🎯 Key Takeaways\n"
            "Top ideas selected, consensus reached, or themes that emerged.\n\n"
            "## 📋 Next Steps\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # EDUCATION / LEARNING
    # ──────────────────────────────────────────────
    {
        "name": "Online Course / Lecture",
        "category": "Education",
        "target_type": "record",
        "description": "Summarizes course sessions: topics, key concepts, examples, and assignments.",
        "prompt_template": (
            "Summarize this online course or lecture recording transcript.\n\n"
            "Use this structure:\n\n"
            "## 📚 Course Details\n"
            "Date & Time: {{meeting_date}} | Instructor | Platform | Duration | Module/Section Title\n\n"
            "## 📝 Topics Covered\n"
            "Main topics discussed during the session.\n\n"
            "## 🧠 Key Concepts & Theories\n"
            "Major concepts, frameworks, or theories explained in detail.\n\n"
            "## 💡 Examples & Case Studies\n"
            "Real-life examples or case studies shared by the instructor.\n\n"
            "## ❓ Q&A Highlights\n"
            "Notable student questions and instructor answers.\n\n"
            "## 📋 Assignments & Resources\n"
            "Homework, exercises, additional reading materials mentioned.\n\n"
            "## 🔜 Next Steps\n"
            "Upcoming lessons or what to focus on next.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Training Session",
        "category": "Education",
        "target_type": "record",
        "description": "Business training summary: objectives, content, skills acquired, and follow-up actions.",
        "prompt_template": (
            "Summarize this training session transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Training Details\n"
            "Date & Time: {{meeting_date}} | Location | Topic | Trainer\n\n"
            "## 📚 Training Overview\n"
            "Objectives and expected outcomes.\n\n"
            "## 📖 Key Content\n"
            "For each topic covered: key points and best practices/examples.\n\n"
            "## 🖍️ Skills & Knowledge Acquired\n"
            "Skills and techniques participants learned.\n\n"
            "## 🎯 Follow-Up Actions\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # MEDIA
    # ──────────────────────────────────────────────
    {
        "name": "Podcast Summary",
        "category": "Media",
        "target_type": "record",
        "description": "Episode overview with segments, key moments, guest insights, and conclusion.",
        "prompt_template": (
            "Summarize this podcast episode transcript.\n\n"
            "Use this structure:\n\n"
            "## 🎧 Episode Info\n"
            "Podcast Title | Episode Title | Host(s) | Guest(s) | Date | Duration\n\n"
            "## 🎙️ Episode Overview\n"
            "Brief description of the episode's theme.\n\n"
            "## 💬 Segments\n"
            "For each segment: title, summary, key points, guest insights.\n\n"
            "## ⏱️ Key Moments\n"
            "Memorable or pivotal moments with approximate timestamps.\n\n"
            "## 🔚 Conclusion\n"
            "Core takeaways and final thoughts.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "YouTube Video Summary",
        "category": "Media",
        "target_type": "record",
        "description": "Structured notes with chapters, key points, and standout quotes.",
        "prompt_template": (
            "Summarize this YouTube video transcript.\n\n"
            "Use this structure:\n\n"
            "## 🎬 Video Info\n"
            "Title | Creator | Publish Date | Duration\n\n"
            "## ▶️ Chapters\n"
            "Break the content into logical chapters. For each:\n"
            "**[Timestamp range] — Chapter Title**\n"
            "- Key Point 1\n"
            "- Key Point 2\n"
            "- Notable quote (if any)\n\n"
            "## 🎯 Key Takeaways\n"
            "Main lessons or insights from the video.\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # HEALTHCARE
    # ──────────────────────────────────────────────
    {
        "name": "SOAP Note",
        "category": "Healthcare",
        "target_type": "record",
        "description": "Clinical SOAP format: Subjective, Objective, Assessment, Plan.",
        "prompt_template": (
            "Summarize this clinical consultation transcript using the SOAP format.\n\n"
            "Use this structure:\n\n"
            "## 📝 Patient Info\n"
            "Date & Time: {{meeting_date}} | Patient | Diagnosis (if known)\n\n"
            "## 🏥 Medical History\n"
            "Relevant past diagnoses and current/past medications.\n\n"
            "## 🗣️ Subjective\n"
            "Patient-reported symptoms and concerns.\n\n"
            "## 🔍 Objective\n"
            "Physical exam findings and diagnostic test results.\n\n"
            "## 📋 Assessment\n"
            "Diagnosis summary and suspected diagnoses.\n\n"
            "## 📅 Plan\n"
            "- **Prescriptions**: medications/treatments prescribed\n"
            "- **Next Steps**: follow-up appointments, tests ordered\n"
            "- **Treatment Plan**: long-term strategy\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Healthcare Consultation",
        "category": "Healthcare",
        "target_type": "record",
        "description": "Doctor-patient interaction: concerns, findings, advice, and follow-up.",
        "prompt_template": (
            "Summarize this healthcare consultation transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Consultation Info\n"
            "Date & Time: {{meeting_date}} | Patient | Consulting Physician\n\n"
            "## 🗣️ Chief Concern\n"
            "Primary complaint or reason for visit.\n\n"
            "## 💊 Medical History\n"
            "Relevant past conditions and medications.\n\n"
            "## 🩺 Symptoms & Findings\n"
            "Patient-reported symptoms and physical exam findings.\n\n"
            "## 💬 Physician's Advice\n"
            "Explanation of condition, treatment options, risks & benefits.\n\n"
            "## 📅 Follow-Up\n"
            "Tests ordered, lifestyle adjustments, next appointment.\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # UX / RESEARCH
    # ──────────────────────────────────────────────
    {
        "name": "User Interview",
        "category": "UX & Research",
        "target_type": "record",
        "description": "UX research: user background, usage behavior, pain points, and insights.",
        "prompt_template": (
            "Summarize this user interview transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Interview Info\n"
            "Date & Time: {{meeting_date}} | Interviewer | Interviewee | Channel (in-person/remote)\n\n"
            "## 💼 Background\n"
            "Purpose of the interview and user background (role, industry, experience).\n\n"
            "## 🧑‍💻 Usage & Behavior\n"
            "Typical workflow, favorite features, alternative tools used.\n\n"
            "## 💡 Needs & Pain Points\n"
            "Biggest challenges, ideal product vision, areas for improvement.\n\n"
            "## 🎯 Key Insights\n"
            "Memorable quotes, strong opinions, contradictions, underlying motivations.\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # SALES PIPELINE
    # ──────────────────────────────────────────────
    {
        "name": "Pipeline Review (MEDDIC)",
        "category": "Client & Sales",
        "target_type": "record",
        "description": "Sales pipeline review using MEDDIC framework: Metrics, Economic Buyer, Decision Criteria, etc.",
        "prompt_template": (
            "Summarize this pipeline review meeting transcript using the MEDDIC framework.\n\n"
            "Use this structure:\n\n"
            "## 📝 Meeting Details\n"
            "Date & Time: {{meeting_date}} | Facilitator | Participants | CRM Snapshot | Review Period\n\n"
            "## 📊 Metrics\n"
            "Quantifiable goals or KPIs the customer aims to achieve.\n\n"
            "## 💰 Economic Buyer\n"
            "The decision-maker with financial authority.\n\n"
            "## 📋 Decision Criteria\n"
            "Key factors the customer uses to evaluate solutions.\n\n"
            "## 📅 Decision Process\n"
            "Overview of the customer's decision-making process and timeline.\n\n"
            "## ⚠️ Identified Pain\n"
            "Critical business issues the solution must address.\n\n"
            "## 🚀 Champion\n"
            "Internal advocate within the customer's organization.\n\n"
            "## 🎯 Next Steps\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # PERSONAL / CASUAL
    # ──────────────────────────────────────────────
    {
        "name": "Personal Call",
        "category": "Personal",
        "target_type": "record",
        "description": "Casual call summary: topics discussed, plans made, and follow-ups.",
        "prompt_template": (
            "Summarize this personal/casual call transcript in a friendly tone.\n\n"
            "Use this structure:\n\n"
            "## 📞 Call Info\n"
            "Date & Time: {{meeting_date}} | Who was on the call | Call type (catch-up, planning, etc.)\n\n"
            "## 💬 What Was Discussed\n"
            "Main topics talked about (2-3 key points).\n\n"
            "## 💡 Interesting or Important Info\n"
            "Highlights worth remembering.\n\n"
            "## 📅 Plans Made\n"
            "Any specific plans or arrangements agreed upon.\n\n"
            "## 🔜 Follow-Up\n"
            "Things to do or next conversation plans.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Memo / Voice Note",
        "category": "Personal",
        "description": "Personal memo or voice note: key ideas, reflections, and action items.",
        "prompt_template": (
            "Summarize this memo or voice note transcript.\n\n"
            "Use this structure:\n\n"
            "## 📝 Memo Details\n"
            "Date & Time: {{meeting_date}} | Duration (if known)\n\n"
            "## 💭 Key Ideas\n"
            "Main thoughts or ideas expressed.\n\n"
            "## 🔍 Reflections\n"
            "Personal reflections, realizations, or self-assessments.\n\n"
            "## ✅ Action Items\n"
            "Tasks or actions to take.\n\n"
            "## 🔜 Next Steps\n"
            "Future plans or things to think about.\n\n"
            "{{transcript}}"
        ),
    },
    # ──────────────────────────────────────────────
    # SECURITY — Pentest Scoping
    # ──────────────────────────────────────────────
    {
        "name": "Pentest - Scoping Call",
        "category": "Security",
        "target_type": "record",
        "description": "Capture pentest engagement scope: targets, constraints, rules of engagement, and timeline.",
        "prompt_template": (
            "Summarize this penetration-testing scoping call transcript.\n\n"
            "Use this structure:\n\n"
            "## 📅 Call Details\n"
            "Date & Time: {{meeting_date}} | Attendees | Client organization\n\n"
            "## 🎯 Engagement Overview\n"
            "Type of assessment (external, internal, web app, API, mobile, red team, etc.), "
            "business context, and reason for the engagement.\n\n"
            "## 🌐 In-Scope Targets\n"
            "| Asset | Type | Details |\n|---|---|---|\n"
            "List every host, IP range, URL, application, or environment explicitly in scope.\n\n"
            "## 🚫 Out-of-Scope / Restrictions\n"
            "Assets, networks, or actions explicitly excluded. "
            "Note any sensitive systems (production DBs, medical devices, etc.).\n\n"
            "## 📜 Rules of Engagement\n"
            "Testing windows, allowed attack types, social-engineering permissions, "
            "DoS restrictions, data-handling rules, point of contact for emergencies.\n\n"
            "## 🔑 Access & Credentials\n"
            "VPN access, test accounts, API keys, or other credentials to be provided. "
            "Note any prerequisite steps (NDA, VPN setup, etc.).\n\n"
            "## 📋 Deliverables & Reporting\n"
            "Expected deliverables (executive summary, technical report, retest), "
            "reporting format, and severity rating framework (CVSS, custom).\n\n"
            "## 📅 Timeline & Milestones\n"
            "| Phase | Start | End |\n|---|---|---|\n"
            "Kick-off, active testing, draft report, final report, retest.\n\n"
            "## ⚠️ Risks & Concerns\n"
            "Potential risks raised during the call (uptime, compliance, data sensitivity).\n\n"
            "## 🎯 Next Steps\n"
            "| Action | Owner | Deadline |\n|---|---|---|\n\n"
            "{{transcript}}"
        ),
    },

    # ──────────────────────────────────────────────
    # WHISPER-SPECIFIC TEMPLATES
    # ──────────────────────────────────────────────
    {
        "name": "Quick Idea Summary",
        "category": "General",
        "target_type": "whisper",
        "description": "Distill a voice memo into a concise idea summary with next steps.",
        "prompt_template": (
            "The following is a transcription of a short voice memo. "
            "Clean it up and present it as a concise, well-structured note.\n\n"
            "## 💡 Idea\n"
            "One-paragraph summary of the core idea or thought.\n\n"
            "## 🔑 Key Points\n"
            "Bullet list of the main points mentioned.\n\n"
            "## 🎯 Next Steps\n"
            "- [ ] Actionable follow-ups extracted from the memo.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Shopping / Grocery List",
        "category": "General",
        "target_type": "whisper",
        "description": "Extract items from a spoken shopping or grocery list.",
        "prompt_template": (
            "The following is a transcription of a voice memo listing items to buy. "
            "Extract and organize the items into a clean checklist.\n\n"
            "## 🛒 Shopping List\n"
            "Group items by category (produce, dairy, meat, pantry, household, etc.). "
            "Use checkboxes:\n"
            "- [ ] Item (quantity if mentioned)\n\n"
            "If any notes or preferences were mentioned (brand, store, etc.), "
            "add them as sub-bullets under the relevant item.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Action Items Checklist",
        "category": "General",
        "target_type": "whisper",
        "description": "Turn a rambling voice memo into a prioritized task list.",
        "prompt_template": (
            "The following is a transcription of a voice memo about tasks or things to do. "
            "Extract every actionable item and present them as a checklist.\n\n"
            "## ✅ Action Items\n"
            "Use checkboxes, ordered by priority (most urgent first):\n"
            "- [ ] Task description (deadline or context if mentioned)\n\n"
            "## 📝 Additional Notes\n"
            "Any context, reminders, or non-actionable thoughts worth keeping.\n\n"
            "{{transcript}}"
        ),
    },
    {
        "name": "Voice Memo to Clean Notes",
        "category": "General",
        "target_type": "whisper",
        "description": "Transform a raw voice memo into polished, readable notes.",
        "prompt_template": (
            "The following is a raw transcription of a voice memo. "
            "Rewrite it as clean, well-organized notes. "
            "Fix grammar, remove filler words, and structure the content logically.\n\n"
            "Use appropriate headings, bullet points, and emphasis. "
            "Preserve all meaningful content but make it concise and scannable. "
            "If the memo contains any tasks or deadlines, format them as checkboxes:\n"
            "- [ ] Task\n\n"
            "{{transcript}}"
        ),
    },
]
