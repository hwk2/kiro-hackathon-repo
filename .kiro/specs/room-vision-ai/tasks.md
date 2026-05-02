# Tasks — Room Vision AI

Tasks are split by team member. Each member has their own task file based on their requirements and the shared design document.

| Task File | Owner | Task Count | Focus |
|-----------|-------|------------|-------|
| [tasks-member1-mobile.md](tasks-member1-mobile.md) | Member 1 | 38 tasks | Image capture, capture guide, Bluetooth pairing, encrypted transfer |
| [tasks-member2-desktop.md](tasks-member2-desktop.md) | Member 2 | 40 tasks | Bluetooth server, image reception, 3D viewport, prompt UI, feedback storage |
| [tasks-member3-ai.md](tasks-member3-ai.md) | Member 3 | 44 tasks | Agent interface, category registry, object detection, model generation, prompt processing, safety rules, plugins |

## Integration Milestones

These milestones require coordination between members:

- [ ] **Milestone A**: Bluetooth protocol handshake works between Member 1 (mobile client) and Member 2 (desktop server) — requires tasks 5.x from Member 1 and tasks 2.x from Member 2
- [ ] **Milestone B**: Image transfer end-to-end — Member 1 sends encrypted images, Member 2 receives and verifies checksums — requires tasks 6.x from Member 1 and tasks 2.x + 3.x from Member 2
- [ ] **Milestone C**: Detection pipeline — Member 2 forwards received images to Member 3's AI Pipeline, receives BlockModel back — requires tasks 3.x from Member 2 and tasks 4.x + 5.x from Member 3
- [ ] **Milestone D**: Prompt-to-response loop — Member 2 sends prompt + BlockModel to Member 3, receives ResponseOptions, displays them — requires tasks 5.x from Member 2 and tasks 6.x from Member 3
- [ ] **Milestone E**: Full demo — capture on mobile → transfer → detect → render 3D → prompt → manipulate → select → store feedback
