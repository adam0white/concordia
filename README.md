# Neighbours: Alder Quay

[Watch the town](https://neighbours.adamwhite.work) · [Design and milestones](docs/neighbours/DESIGN.md) · [Run and debug](docs/neighbours/RUNNING.md) · [Prior art](docs/neighbours/PRIOR_ART.md)

A riverside town after a flood. Eight familiar neighbours and two hundred other residents balance ordinary needs, promises and the work of reopening a community hall. The public town runs actual Python Concordia and Human Framework locally in your browser. It is not a shared server town. Person cards expose decisions. Compare offers hypothetical futures, recorded studies and diagnostics.

This is a fork of Google DeepMind Concordia. Upstream history and code remain intact. Our application is in `neighbours/`; its custom Python engine is in `concordia/contrib/neighbours/`. Development branch: `neighbours`. Human Framework is consumed as an exact published package. Recorded native LLM experiments are labelled separately from the live all-HF browser town.

The delivered player-agency town has twelve weekly hall conflicts after the original four evenings. Each week supplies one support choice: fund an unposted alternate date or advertise a posted invitation. People choose whether to propose, prepare, accept and attend. Contextual comparisons preserve the live town. History retains distinct dated outcomes; exports are lossless `.json.gz` files, and imports also accept plain JSON. See [player agency and verification](docs/neighbours/player-agency.md).

The delivered town now adds a welcome screen before runtime downloads, paused entry/new-town/import/restore, compact sticky controls and story stops enabled by default. Dates, news eligibility and cart status describe actual host state. A bounded annex inspection lets a neighbour receive a request, travel, observe timber and use retained HF methods. A safe completed inspection can open four extra hall places. The request supplies no method and guarantees no help.

The browser can apply one authored or recorded GM proposal after host validation. A separate native experiment runs real upstream Concordia GM components with one genuine model call and exact response replay. It proposes a scenario premise; it cannot declare repairs, learning, consent or attendance. Live browser residents still use HF, with no live browser LLM. Isolated HF configuration probes preserve production defaults and report negative results. See [the current increment](docs/neighbours/gm-and-town-agency.md) and [the native GM contract](docs/neighbours/gm-director.md).

The mobile increment separates Town, Help, Stories and Compare. The opening goal and help stay reachable, selecting a person focuses their card, and comparisons lead with changed outcomes. Save, import and town settings live in one dialog. Independent adversarial, speedrunner, entertainment and wildcard visitors tested separate agendas. See [mobile design](docs/neighbours/mobile-focus.md) and [review and verification](docs/neighbours/visitor-2026-10-16-mobile.md). Adam accepts game feel; tests do not establish sustained enjoyment, human realism or HF superiority.

The current candidate adds cancellable Next navigation, actual followed-person promise and invitation outcomes, a separate recorded-study workbench and received bench-window information without automatic permission. It uses exact published HF2.3.0. The new natural-town bench cases remain negative: received access changes asking value but all nine initial choices still use the side bench. Genuine native Concordia GM recordings and zero-call replays remain separate from the browser. See [received plans](docs/neighbours/received-plans.md) and [visitor evidence and delivery status](docs/neighbours/visitor-2026-10-18-received-plans.md).

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
