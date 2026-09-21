import unittest

from grant_policy import auto_allowed, parse_grant

GRANT = {"domains": ["example.com"], "steps": 30}
on = lambda **k: {"url": "https://www.example.com/submit-a-tool", **k}


class GrantPolicy(unittest.TestCase):
    def test_parse_rejects_malformed(self):
        self.assertEqual(parse_grant(GRANT), GRANT)
        for bad in (None, {}, {"domains": [], "steps": 30}, {"domains": ["*"], "steps": 30},
                    {"domains": ["example.com"], "steps": 41}, {"domains": ["example.com"], "steps": True},
                    {"domains": ["https://example.com"], "steps": 30}, {"domains": ["com"], "steps": 30}):
            self.assertIsNone(parse_grant(bad))

    def test_no_grant_means_every_action_prompts(self):
        self.assertFalse(auto_allowed(on(kind="type_text"), None))

    def test_routine_steps_on_domain_run(self):
        self.assertTrue(auto_allowed(on(kind="type_text"), GRANT))
        self.assertTrue(auto_allowed(on(kind="click", target="Product name"), GRANT))
        self.assertTrue(auto_allowed(on(kind="press_offscreen", target="Category"), GRANT))

    def test_consequential_or_unknown_steps_prompt(self):
        for target in ("Submit", "Send message", "Publish now", "Pay $20", "Log in", "Delete", "Next", "", None):
            self.assertFalse(auto_allowed(on(kind="click", target=target), GRANT), target)
        for kind in ("press_enter", "open_site", "something_new"):
            self.assertFalse(auto_allowed(on(kind=kind), GRANT), kind)

    def test_other_domains_prompt(self):
        for url in ("https://evil.com/?example.com", "https://example.com.evil.com", "http://example.com",
                    "https://notexample.com", None, ""):
            self.assertFalse(auto_allowed({"url": url, "kind": "type_text"}, GRANT), url)


if __name__ == "__main__":
    unittest.main()
