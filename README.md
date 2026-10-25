# Neighbours: Alder Quay

[Play Neighbours](https://neighbours.adamwhite.work) · [Design and milestones](docs/neighbours/DESIGN.md) · [Current handoff](HANDOFF.md) · [Prior art](docs/neighbours/PRIOR_ART.md)

Help a riverside town reopen its flooded community hall. Nora, Derya, Sam, Bilal, Rafi and Ece live alongside 200 persistent background residents: 206 people in a fresh canonical town. Residents choose for themselves. Help can be refused, delayed or left unfinished.

## How to play

Choose **Enter Alder Quay**, or **Return to Alder Quay** to continue this browser’s saved town. The first visit downloads the Python runtime. Time advances automatically. Select a neighbour on the map to read about them. Walk to their location to speak with them while they are awake. Ask for help or offer work. A conversation holds time. A promise binds when the person agrees or later acts on your request. Watch what people actually finish; an offer alone is not completed work.

Use **Help the town** for support actions that change conditions and spend town credits. **Skip ⏩** advances actual rounds until the next relevant event; it does not guarantee success. Open **Game menu** to pause time. Its ordinary choices include Feedback, Full screen, All games, Recording, New game and Resume. New game keeps the current town as the previous town. The information button explains the current activity.

## What runs

| Part | Current responsibility |
| --- | --- |
| Published Human Framework library **3.0.0** | HF people’s perceptions, acquired state and decisions; saved Person engine version **2.23.0** |
| TypeScript host in `neighbours/` | World facts, feasible actions, travel, resources, physical outcomes, player inputs and saves |
| Custom Python engine in `concordia/contrib/neighbours/` | Actual Concordia Entity/ActionSpec observation, choice, resolution and checkpoint orchestration |
| Browser worker | Runs that Python engine through Pyodide and calls the TypeScript runtime on this device |

The public default town uses HF choices for every resident. It runs in your browser, not in a shared server town. It needs no model key. Python failure does not silently switch to a recording or another engine. Native runs use CPython and a persistent Node JSON-lines bridge to the same host runtime.

Diagnostics require exact `?lab=1`. They expose hypothetical comparisons, recorded studies, inspector detail and optional pace controls. Table and random policies are labelled comparison controllers; they do not use HF to select their actions. Native mixed-controller studies use genuine model responses for labelled LLM choices over feasible actions, with HF person state. Separate native GM experiments use upstream Concordia GM components to propose validated premises. Neither model prose nor a proposed premise establishes a physical outcome. These experiments do not enable live browser LLM decisions. Recorded response replays make zero model calls; they are not live decisions.

## Saves, recording and continuation

The town autosaves to IndexedDB in this browser. A conflicting tab pauses rather than overwriting a newer checkpoint. Reload restores saved state. Current-version exports preserve runtime state and player inputs for deterministic continuation. Export produces lossless `.json.gz`; import accepts gzip or plain JSON, with a 50 MiB limit on both compressed input and expanded JSON. These diagnostic file tools are not ordinary menu choices: Other ways in is on the title with `?lab=1`, and Feedback supplies **Keep a copy of this run** in lab mode. Unsupported older saves or continuing-person obligations may be refused. A loaded chapter stays pinned to its admitted people; it does not pull newer shelf state into an existing run. Imported files remain file-origin, rather than becoming locally owned history.

Recording is separate from device saving. The one Recording switch controls lab recording and automatic cross-game linkage on this device. DNT/GPC sets the initial default off; turning recording on opts in. Feedback remains available with recording off. Its optional sharing checkbox can opt in when submitting; character analysis keeps its separate opt-in. This host still consumes immutable lab-client **0.4.10** and lab-kit **0.5.11**. Newer SDK feedback artifacts are not adopted here.

## Run and verify

Use Node **24 or newer**. The repository’s CI uses Node 26.12.0 and Python 3.12.13. TypeScript consumers need **7 or newer**. Install from the application directory; Concordia has no root npm lockfile.

```sh
cd neighbours
npm ci
npm run dev -- --port 5190
npm run check:lane
```

`check:lane` runs the full local lint, three typechecks, unit tests, plain-Node imports and build. Native checks additionally need Python and `neighbours/native-gm-requirements.txt`; browser checks use actual Python WASM. See `.github/workflows/neighbours.yml` for the current native, browser, parity, restored-continuation, zero-call replay and evidence commands. [Run and debug](docs/neighbours/RUNNING.md) retains older delivery instructions and counts; current source and this handoff take precedence for the cast, clock and ordinary controls.

## Delivery and limits

The public `/release.json` identifies the deployed commit, dirty flag, HF library and Python bundle. It differs from the npm app version `0.1.0` and release schema `neighbours@1`. On 2026-10-25 the verified pre-documentation release was `0e822944663f4922a95fa7e606bbbff4f7b2527b`, HF 3.0.0, `dirty:false`, with [exact green CI 40239981482](https://github.com/adam0white/concordia/actions/runs/40239981482). Later source-only documentation commits need no app deployment.

That delivery checked live entry/menu at phone and desktop sizes without loading the saved town. Its controlled React fixtures verified copy, not game layout or ordinary played outcomes. Historical source-unread visits, deterministic studies and native recordings retain their own dates and limits. None establishes current owner acceptance, sustained enjoyment, human realism or HF superiority. Adam accepts reading, timing and feel separately. Lab-panel rounds on HF3 builds are allowed under the playtest director; friends’ playtests and Show HN remain paused.

This public fork preserves Google DeepMind Concordia’s upstream history, copyright, license and documentation below. Neighbours uses exact published HF, not sibling or vendored framework source. Distributed licenses are in `/third-party-notices.txt`. Development and integration branch: **neighbours**.

---

# Concordia

*A library for generative social simulation*

<!-- GITHUB -->
<!-- disableFinding(LINK_RELATIVE_G3DOC) -->

[![Python](https://img.shields.io/pypi/pyversions/gdm-concordia.svg)](https://pypi.python.org/pypi/gdm-concordia)
[![PyPI version](https://img.shields.io/pypi/v/gdm-concordia.svg)](https://pypi.python.org/pypi/gdm-concordia)
[![PyPI tests](../../actions/workflows/pypi-test.yml/badge.svg)](../../actions/workflows/pypi-test.yml)
[![Tests](../../actions/workflows/test-concordia.yml/badge.svg)](../../actions/workflows/test-concordia.yml)
[![Examples](../../actions/workflows/test-examples.yml/badge.svg)](../../actions/workflows/test-examples.yml)
<!-- /GITHUB -->

[Concordia Tech Report](https://arxiv.org/abs/2312.03664) | [Concordia Design Pattern](https://arxiv.org/abs/2507.08892) | [Code Cheat Sheet](CHEATSHEET.md)

## About

Concordia is a library for constructing and running generative agent-based
models that simulate interactions among entities in grounded physical, social,
or digital environments. It uses an interaction pattern inspired by tabletop
role-playing games: a special entity called the **Game Master** (GM) simulates
the environment in which player entities interact. Entities describe their
intended actions in natural language, and the GM translates these into
appropriate outcomes e.g. checking physical plausibility in simulated worlds.

Concordia supports a broad range of applications, including social science
research, AI safety and ethics, cognitive neuroscience, economics, synthetic
data generation for personalization, and performance evaluation of real services
through simulated usage.

Concordia requires access to a standard LLM API and may optionally integrate
with external applications and services.

## How it Works

A simulation is built from **entities**. Each entity contains **components**
that supply behavior and state, such as instructions, memory and action
selection. **Prefabs** are prebuilt entity templates. Instantiate a prefab, then
override parameters such as the entity’s name, instructions or goal. Its
standard factory constructs the components from those settings.

The **engine** organizes execution. For each `run_loop` call, entities are
assigned player or game master roles. The engine requests player entity actions
and asks game master entities to provide observations and resolve those actions.
These are roles in that call, rather than intrinsic entity classes.

Start with the
[GUI and CLI entity-component guide](concordia/command_line_interface/README.md)
to inspect components, edit a simulation, and observe its behavior.

## Folder Structure

*   **[`concordia/prefabs`](concordia/prefabs/README.md)**: Pre-assembled
    starting configurations for entities and their components.
*   **[`concordia/components`](concordia/components/README.md)**: Modular
    building blocks for entities, including memory systems, and sensory modules.
*   **[`concordia/environment`](concordia/environment/README.md)**: Contains the
    engine interfaces which determine turn-taking, simultaneous action, or
    asynchronous action.
*   **[`concordia/document`](concordia/document/README.md)**: Utilities for
    managing LLM prompts and context.
*   **[`concordia/language_model`](concordia/language_model/README.md)**: LLM
    integration and API wrappers.
*   **[`examples/`](examples/)**: Tutorials and example simulations to help you
    get started.

## Tutorials

1.  A tutorial that focuses on interaction with the GUI editor and CLI interface: [Concordia GUI and CLI Tutorial](https://concordia-tutorial.pages.dev/).
2.  In-depth tutorial lecture on YouTube: [Concordia: Building Generative Agent-Based Models](https://youtu.be/2FO5g65mu2I?si=TSk7XTk4gCaadEDs), works with [`examples/tutorial.ipynb`](examples/tutorial.ipynb).

## Installation

[Concordia is available on PyPI](https://pypi.python.org/pypi/gdm-concordia)
and can be installed using:

```shell
pip install gdm-concordia
```

After doing this you can then `import concordia` in your own code.

## Development

### Codespace

The easiest way to work on the Concordia source code is to use our
pre-configured development environment via a
[GitHub Codespace](https://github.com/features/codespaces).

This provides a tested, reproducible development workflow that minimizes
dependency management. We strongly recommend preparing all pull requests for
Concordia via this workflow.

### Manual setup

If you want to work on the Concordia source code within your own development
environment you will have to handle installation and dependency management
yourself.

For example, you can perform an editable installation as follows:

1.  Clone Concordia:

    ```shell
    git clone -b main https://github.com/google-deepmind/concordia
    cd concordia
    ```

2.  Create and activate a virtual environment:

    ```shell
    python -m venv venv
    source venv/bin/activate
    ```

3.  Install Concordia:

    ```shell
    pip install --editable .[dev]
    ```

4.  Test the installation:

    ```shell
    pytest --pyargs concordia
    ```

5.  Install any additional language model dependencies you will need, e.g.:

    ```shell
    pip install .[google]
    pip install --requirement=examples/requirements.in
    ```

    Note that at this stage you may find that your development environment is
    not supported by some underlying dependencies and you will need to do some
    dependency management.

## Bring your own LLM

Concordia requires access to an LLM API. Any LLM API that supports sampling
text should work, though result quality depends on the capabilities of the
chosen model. You must also provide a text embedder for associative memory. Any
fixed-dimensional embedding works for this, ideally one suited to sentence
similarity or semantic search.

## Example usage

Find below an illustrative social simulation where 4 friends are stuck in a
snowed in pub. Two of them have a dispute over a crashed car.

The agents are built using a simple reasoning inspired by March and Olsen (2011)
who posit that humans generally act as though they choose their actions by
answering three key questions:

1. What kind of situation is this?
2. What kind of person am I?
3. What does a person such as I do in a situation such as this?

The agents used in the following example implement exactly these questions:

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.sandbox.google.com/github/google-deepmind/concordia/blob/main/examples/tutorial.ipynb)

## Citing Concordia

If you use Concordia in your work, please cite the accompanying article:

<!-- disableFinding(SNIPPET_INVALID_LANGUAGE) -->

```bibtex
@article{vezhnevets2023generative,
  title={Generative agent-based modeling with actions grounded in physical,
  social, or digital space using Concordia},
  author={Vezhnevets, Alexander Sasha and Agapiou, John P and Aharon, Avia and
  Ziv, Ron and Matyas, Jayd and Du{\'e}{\~n}ez-Guzm{\'a}n, Edgar A and
  Cunningham, William A and Osindero, Simon and Karmon, Danny and
  Leibo, Joel Z},
  journal={arXiv preprint arXiv:2312.03664},
  year={2023}
}
```

## Disclaimer

This is not an officially supported Google product.

For a complete interactive authoring walkthrough and explicit editor/CLI
coverage, see the
[GUI and CLI entity-component guide](concordia/command_line_interface/README.md).
