# Logistic Shipment Skill Install Prompt

Copy and paste the prompt below into any Letta Code chat for the agent that should use the Shipment Tracker skill.

```text
Please install the Logistic Shipment skill from parkinglot for this agent.

Steps:
1. Locate the local parkinglot repository on this machine.
2. Pull the latest parkinglot data before installing anything.
3. In parkinglot, find the skill at shared/shipment-tracking-system/skill/logistic-shipment.
4. Install the skill into the correct skills location for this Letta Code session and operating system. Decide the correct location based on how this agent is running, such as project skills, agent skills, or another supported local skills directory.
5. Replace any existing logistic-shipment skill with the parkinglot version.
6. Make the helper script executable if the operating system uses executable permissions.
7. Verify SKILL.md, scripts/shipment_tracker.py, and references/api-reference.md exist after install.
8. Tell me where you installed it and whether I need to restart or open a new Letta Code session to load it.

Important:
- Do not copy or share any saved API token file.
- Do not hardcode a Mac, Windows, or Ubuntu path unless this machine actually uses that path.
- Do not ask the human to paste raw tokens into chat.
- Configure the API token as a Letta secret or environment variable named `SHIPMENT_TRACKER_TOKEN`.
- Configure the helper's audit header with `python scripts/shipment_tracker.py auth set-agent-name <AgentName>` or pass `--agent-name <AgentName>` on requests.
- API means Application Programming Interface.
```

## Source location in parkinglot

```text
shared/shipment-tracking-system/skill/logistic-shipment
```
