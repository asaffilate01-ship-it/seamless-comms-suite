"""Offline pure security tests; no network and no Scrapling install required."""
import importlib.util
import pathlib
import socket
import unittest
from unittest.mock import patch

MODULE = pathlib.Path(__file__).parents[1] / "worker.py"
spec = importlib.util.spec_from_file_location("scrapling_worker_under_test", MODULE)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerSecurityTests(unittest.TestCase):
    def test_credentials_ports_and_redirect_style_hosts_rejected(self):
        bad = [
            ("http://example.com/", "example.com"),
            ("https://foo@example.com/", "example.com"),
            ("https://example.com:8080/", "example.com"),
            ("https://example.com#marker", "example.com"),
            ("https://localhost.local/", "localhost.local"),
            ("https://example.org/", "example.com"),
            ("https://127.0.0.1/", "127.0.0.1"),
        ]
        for url, approved in bad:
            with self.subTest(url=url), self.assertRaises(ValueError):
                worker.validate_target(url, approved)

    def test_public_dns_accepted_and_private_dns_refused(self):
        with patch.object(socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", 443))
        ]):
            worker.validate_target("https://example.com/menu", "example.com")
        for addr in ["127.0.0.1", "10.0.0.7", "169.254.169.254", "192.168.1.8", "::1", "fc00::1"]:
            with patch.object(socket, "getaddrinfo", return_value=[
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, 443))
            ]):
                with self.subTest(addr=addr), self.assertRaises(ValueError):
                    worker.validate_target("https://example.com/menu", "example.com")

    def test_html_is_plain_text_without_scripts_or_styles(self):
        sample = "<html><body><h1>Menu</h1><script>steal_token()</script><style>private!</style><p>Soup &amp; bread</p></body></html>"
        text = worker.extract_plain_text(sample, 40000)
        self.assertIn("Menu", text)
        self.assertIn("Soup & bread", text)
        self.assertNotIn("steal_token", text)
        self.assertNotIn("private!", text)

    def test_bounded_extraction(self):
        self.assertEqual(len(worker.extract_plain_text("<p>" + ("a" * 120) + "</p>", 25)), 25)


if __name__ == "__main__":
    unittest.main()
