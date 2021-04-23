# wait-for-workflows-to-succeed

[![Acceptance Tests](https://github.com/emilgoldsmith/wait-for-workflows-to-succeed/actions/workflows/acceptance-tests.yml/badge.svg)](https://github.com/emilgoldsmith/wait-for-workflows-to-succeed/actions/workflows/acceptance-tests.yml)


This is mainly meant for personal use, the README is quite simple. Feel free to PR README improvements if interested.

```yml
inputs:
  wait-interval-seconds:
    description: Seconds to wait between checks
    required: true

  wait-max-seconds:
    description: Max seconds to wait in total before failing
    required: true

  repo-token:
    description: The github.token in context or GITHUB_TOKEN env variable repo token for your workflow
    required: true

  workflows:
    description: The workflows to wait for. Either specify one as a normal string or several workflows as newline separated strings with forexample the | multiline YAML syntax
    required: true

  debug:
    description: Whether or not to have debug logs show. Possible values are `on`, `off`, and `verbose`
    required: false
    default: "off"
```
