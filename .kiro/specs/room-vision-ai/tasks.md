# Tasks — Room Vision AI

Tasks are split by team member. Each member has their own task file based on their requirements and the shared design document.

| Task File | Owner | Task Count | Completed | Focus |
|-----------|-------|------------|-----------|-------|
| [tasks-member1-mobile.md](tasks-member1-mobile.md) | Member 1 | 38 tasks | 20 / 38 | Image capture, capture guide, Bluetooth pairing, encrypted transfer |
| [tasks-member2-desktop.md](tasks-member2-desktop.md) | Member 2 | 55 tasks | 0 / 55 | Bluetooth server, image reception, 3D viewport, prompt UI, feedback storage |
| [tasks-member3-ai.md](tasks-member3-ai.md) | Member 3 | 70 tasks | 70 / 70 ✅ | Agent interface, category registry, object detection, model generation, prompt processing, safety rules, plugins |

## Progress Summary

| Member | Status | Notes |
|--------|--------|-------|
| **Member 1** | 🟡 In Progress (53%) | Sections 1–4 partially done. Sections 5 (Bluetooth pairing), 6 (encrypted transfer), and 7 (integration) not started. |
| **Member 2** | 🔴 Not Started (0%) | All 55 tasks across all sections remain incomplete. |
| **Member 3** | 🟢 Complete (100%) | All 70 tasks complete — AI pipeline, detection, model generation, prompt processing, safety rules, plugins, and tests. |

### Member 1 Detail

| Section | Done | Total | Status |
|---------|------|-------|--------|
| 1. Project Setup | 4 | 5 | 🟡 Task 1.2 (Android build config) deferred |
| 2. Image Capture — Camera | 5 | 5 | ✅ Complete |
| 3. Gallery/File Import | 5 | 6 | 🟡 Task 3.3 (file manager import) incomplete |
| 4. Capture Guide UX | 6 | 8 | 🟡 Tasks 4.2 (diagram asset) and 4.5 (dismiss toggle) incomplete |
| 5. Bluetooth Pairing | 0 | 11 | 🔴 Not started |
| 6. Encrypted Image Transfer | 0 | 10 | 🔴 Not started |
| 7. Integration and Testing | 0 | 8 | 🔴 Not started |

## Integration Milestones

These milestones require coordination between members:

- [ ] **Milestone A**: Bluetooth protocol handshake works between Member 1 (mobile client) and Member 2 (desktop server) — requires tasks 5.x from Member 1 and tasks 2.x from Member 2
- [ ] **Milestone B**: Image transfer end-to-end — Member 1 sends encrypted images, Member 2 receives and verifies checksums — requires tasks 6.x from Member 1 and tasks 2.x + 3.x from Member 2
- [ ] **Milestone C**: Detection pipeline — Member 2 forwards received images to Member 3's AI Pipeline, receives BlockModel back — requires tasks 3.x from Member 2 *(not started)* and tasks 4.x + 5.x from Member 3 *(complete)*
- [ ] **Milestone D**: Prompt-to-response loop — Member 2 sends prompt + BlockModel to Member 3, receives ResponseOptions, displays them — requires tasks 5.x from Member 2 *(not started)* and tasks 6.x from Member 3 *(complete)*
- [ ] **Milestone E**: Full demo — capture on mobile → transfer → detect → render 3D → prompt → manipulate → select → store feedback
