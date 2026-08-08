import unittest
from unittest.mock import Mock, patch

import server


class ModelLoadingTest(unittest.TestCase):
    def tearDown(self):
        server._model = None

    @patch.object(server.AutoModelForImageSegmentation, "from_pretrained")
    def test_disables_meta_tensor_loading_for_birefnet(self, from_pretrained):
        model = Mock()
        from_pretrained.return_value = model
        server._model = None

        loaded = server._load_model()

        self.assertIs(loaded, model)
        from_pretrained.assert_called_once_with(
            server.MODEL_ID,
            trust_remote_code=True,
            low_cpu_mem_usage=False,
        )
        model.to.assert_called_once_with(server._device)
        model.eval.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
