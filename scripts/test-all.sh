#!/bin/zsh
# Runs every test in tests/ one at a time and prints a PASS/FAIL line for each, then a summary.
# .cjs files run in Node; .mjs files drive a headless Chrome. The equation benchmark (tests/ocr-bench) is separate.
cd "${0:A:h}/.."
passed=0; failed=0; failures=()
for test in tests/*.cjs tests/*.mjs; do
  output=$(node "$test" 2>&1)
  if [[ $? -eq 0 ]]; then passed=$((passed+1)); print "PASS  $test"
  else failed=$((failed+1)); failures+=("$test"); print "FAIL  $test"; print "$output" | grep -m1 -E "AssertionError|Error:" | cut -c1-200 | sed 's/^/      /'
  fi
done
print "\n$passed passed, $failed failed"
for test in $failures; do print "  failed: $test"; done
[[ $failed -eq 0 ]]
