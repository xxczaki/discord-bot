#!/usr/bin/env bash
set -euo pipefail

# Creates a commit from the staged changes through the GitHub GraphQL API.
# Commits made this way with a GitHub App token are signed by GitHub and show as verified.
# Usage: GH_TOKEN=... commit-via-api.sh <owner/repo> <branch> <headline>

repository="$1"
branch="$2"
headline="$3"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

head_oid="$(git rev-parse HEAD)"

git diff --cached --no-renames --name-only --diff-filter=d -z |
	while IFS= read -r -d '' path; do
		jq --null-input --arg path "$path" --rawfile contents <(base64 <"$path" | tr -d '\n') \
			'{path: $path, contents: $contents}'
	done | jq --slurp . >"$work_dir/additions.json"

git diff --cached --no-renames --name-only --diff-filter=D -z |
	while IFS= read -r -d '' path; do
		jq --null-input --arg path "$path" '{path: $path}'
	done | jq --slurp . >"$work_dir/deletions.json"

jq --null-input \
	--arg repository "$repository" \
	--arg branch "$branch" \
	--arg head_oid "$head_oid" \
	--arg headline "$headline" \
	--slurpfile additions "$work_dir/additions.json" \
	--slurpfile deletions "$work_dir/deletions.json" \
	'{
		query: "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }",
		variables: {
			input: {
				branch: {repositoryNameWithOwner: $repository, branchName: $branch},
				expectedHeadOid: $head_oid,
				message: {headline: $headline},
				fileChanges: {additions: $additions[0], deletions: $deletions[0]}
			}
		}
	}' >"$work_dir/request.json"

gh api graphql --input "$work_dir/request.json" --jq '.data.createCommitOnBranch.commit | "Created \(.oid) \(.url)"'
