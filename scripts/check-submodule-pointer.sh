#!/usr/bin/env bash
#
# Fails when a commit would move the luminary-media-convert submodule pointer backwards, or off
# the line of main's pointer. A submodule bump is a one-line SHA change in a diff, so committing a
# stale checkout silently reverts the encoder/player; this makes it loud.
#
# Usage:
#   check-submodule-pointer.sh --staged            staged pointer vs HEAD's (pre-commit)
#   check-submodule-pointer.sh --ref <commit> [--base <commit>]
#                                                  a commit's pointer vs base's, default
#                                                  origin/main (pre-push, CI). Only checked when
#                                                  the commit changed the pointer since the
#                                                  merge base: a branch that is merely behind
#                                                  main takes main's pointer on merge.
#
# Set SUBMODULE_CHECK_NO_FETCH=1 to never fetch the submodule (offline).

set -euo pipefail

SUB="luminary-media-convert"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

red() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# The gitlink SHA recorded for $SUB in a tree-ish, or in the index when $1 is ":staged".
pointer_at() {
    if [[ "$1" == ":staged" ]]; then
        git ls-files -s -- "$SUB" | awk '$1 == "160000" { print $2 }'
    else
        git ls-tree "$1" -- "$SUB" 2>/dev/null | awk '$1 == "160000" { print $3 }'
    fi
}

sub_git() { git -C "$ROOT/$SUB" "$@"; }

have_commit() { sub_git cat-file -e "$1^{commit}" 2>/dev/null; }

ensure_commits() {
    local missing=0 sha
    for sha in "$@"; do have_commit "$sha" || missing=1; done
    if ((missing)) && [[ "${SUBMODULE_CHECK_NO_FETCH:-}" != "1" ]]; then
        sub_git fetch -q origin 2>/dev/null || true
    fi
    for sha in "$@"; do
        if ! have_commit "$sha"; then
            red "submodule check: $SUB commit $sha is not available locally; skipping."
            exit 0
        fi
    done
}

describe() { sub_git log -1 --format='%h %s (%cs)' "$1"; }

# Passes when $candidate is $baseline or a descendant of it.
compare() {
    local candidate="$1" baseline="$2" baseline_label="$3"
    [[ -z "$candidate" || -z "$baseline" || "$candidate" == "$baseline" ]] && return 0

    if [[ ! -e "$ROOT/$SUB/.git" ]]; then
        red "submodule check: $SUB is not initialised; run 'git submodule update --init $SUB'."
        exit 1
    fi
    ensure_commits "$candidate" "$baseline"
    sub_git merge-base --is-ancestor "$baseline" "$candidate" && return 0

    local how="behind"
    sub_git merge-base --is-ancestor "$candidate" "$baseline" || how="diverged from"
    red "✖ $SUB pointer is $how $baseline_label."
    red "    this commit: $(describe "$candidate")"
    red "    $baseline_label: $(describe "$baseline")"
    red "  That reverts the submodule. If you didn't mean to change it:"
    red "    git submodule update $SUB   (then re-stage, or 'git checkout <base> -- $SUB')"
    exit 1
}

case "${1:-}" in
    --staged)
        compare "$(pointer_at :staged)" "$(pointer_at HEAD)" "HEAD's pointer"
        ;;
    --ref)
        ref="${2:?--ref needs a commit}"
        base="origin/main"
        [[ "${3:-}" == "--base" ]] && base="${4:?--base needs a commit}"
        merge_base="$(git merge-base "$ref" "$base")"
        candidate="$(pointer_at "$ref")"
        [[ "$candidate" == "$(pointer_at "$merge_base")" ]] && exit 0
        compare "$candidate" "$(pointer_at "$base")" "$base's pointer"
        ;;
    *)
        sed -n '2,17p' "$0" >&2
        exit 2
        ;;
esac
