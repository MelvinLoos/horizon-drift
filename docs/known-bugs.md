# Known bugs register

Bugs found in the legacy prototype. Per the [workflow](../CONTRIBUTING.md#fixing-bugs), each fix
lands as its own commit with a test that reproduced it first. When a bug is fixed, set its status
to **fixed** and link the commit; do not delete the row.

Browser-reproducible bugs have a `test.fail()` spec in `tests/e2e/smoke.spec.ts` (`known bugs`).
A fix makes that spec pass, Playwright reports it as "passed unexpectedly", and the fix commit
removes the `test.fail()` marker.

| ID      | Bug                                                                                                                                      | Where (legacy)          | Repro                                               | Planned fix | Status                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------- | ----------- | ------------------------- |
| BUG-001 | Changing station (`R`) before **Start** throws `TypeError: reading 'wet'` (`applyStationSettings` touches `this.reverb` before `init()`) | `index.html:891-933`    | e2e `BUG-001`                                       | 2.5         | open                      |
| BUG-002 | Zen mode sets `pointerEvents` to `'none'` in both branches; the invisible dashboard stays clickable                                      | `index.html:2231-2237`  | e2e `BUG-002`                                       | 2.4         | open                      |
| BUG-003 | Key auto-repeat re-triggers toggles (no `event.repeat` guard)                                                                            | `index.html:2113-2121`  | e2e `BUG-003`                                       | 2.3         | **fixed** (2.3; app only) |
| BUG-004 | Braking does not disengage cruise control: after braking, the car accelerates back to the old set speed                                  | `index.html:2424-2443`  | `fixtures/legacy/drive.json` (`steer-left` segment) | 2.6         | open                      |
| BUG-005 | Touch pads never release on `touchcancel`/`mouseleave` → stuck throttle/steer                                                            | `index.html:2145-2156`  | unit (2.3)                                          | 2.3         | **fixed** (2.3)           |
| BUG-006 | `tickStep` swallows every error (`catch {}`)                                                                                             | `index.html:873-876`    | unit (2.5)                                          | 2.5         | open                      |
| BUG-007 | Start toast is hard-coded to "88.5 FM NIGHTCALL SYNTHWAVE"                                                                               | `index.html:2164`       | unit (2.4)                                          | 2.4         | open                      |
| BUG-008 | Progression switch hard-codes `[0, 1, 2]` instead of `progressions.length`                                                               | `index.html:683`        | unit (2.5)                                          | 2.5         | open                      |
| BUG-009 | Hi-hat `envelope.decay` is mutated at schedule time, affecting already-scheduled notes                                                   | `index.html:858, 867`   | listening test (2.5)                                | 2.5         | open                      |
| BUG-010 | "Mute" stops note generation instead of muting (tails keep ringing; button semantics unclear)                                            | `index.html:935-946`    | unit (2.5)                                          | 2.5         | open                      |
| BUG-011 | Shadow map enabled, but nothing casts or receives shadows (wasted setup)                                                                 | `index.html:980-981`    | review                                              | 2.8         | open                      |
| BUG-012 | Float32 vertex precision → visible jitter after very long drives (\|z\| ≫ 100 km)                                                        | terrain/car positioning | e2e teleport (4)                                    | 4           | open                      |
| BUG-013 | Landform/biome/station toasts overwrite each other (single toast slot)                                                                   | `index.html:2239-2250`  | unit (2.4)                                          | 2.4         | open                      |
| BUG-014 | "Mouse / Touch look-around" comment, but look-around has no touch support                                                                | `index.html:2126-2142`  | e2e (2.3)                                           | 2.3         | **fixed** (2.3)           |
