"""Installed GX configuration validation only; never runs dataset validation."""
from functools import lru_cache
from app.evaluation.parser import Expression


class ExpectationRegistry:
    def __init__(self, environment_dependent=None):
        import great_expectations
        from great_expectations.expectations.registry import get_expectation_impl, list_registered_expectation_implementations
        self.version = great_expectations.__version__
        self.implementations = {name: get_expectation_impl(name) for name in list_registered_expectation_implementations()}
        self.environment_dependent = set(environment_dependent or ())

    def validate(self, call):
        name = call.function.split('.')[-1]
        def failure(code, detail, category='supported/core'):
            return {'function': call.function, 'code': code, 'detail': detail, 'category': category}
        if name in self.environment_dependent:
            return [failure('UNSUPPORTED_FUNCTION', 'Known rule requires a configured environment', 'environment-dependent')]
        impl = self.implementations.get(name)
        if impl is None:
            return [failure('UNKNOWN_FUNCTION', 'Function is not registered in installed GX', 'unknown')]
        signature = impl.args_keys
        kwargs = dict(call.kwargs)
        if len(call.args) > len(signature) or any(key in kwargs for key in signature[:len(call.args)]):
            return [failure('INVALID_INVOCATION', 'Too many positional arguments or duplicate bindings')]
        kwargs.update(zip(signature, call.args))
        def dynamic(value):
            if isinstance(value, Expression): return True
            if isinstance(value, dict): return any(dynamic(item) for item in value.values())
            if isinstance(value, (tuple, list)): return any(dynamic(item) for item in value)
            return False
        if any(key.startswith('**') or dynamic(value) for key, value in kwargs.items()):
            return [failure('INVALID_INVOCATION', 'Dynamic expressions cannot be validated statically')]
        fields = impl.__fields__
        errors = [failure('INVALID_PARAMETER', f'Unrecognized argument: {key}') for key in kwargs if key not in fields]
        errors += [failure('MISSING_REQUIRED_PARAMETER', f'Missing argument: {key}') for key, field in fields.items() if field.required and key not in kwargs]
        if errors: return errors
        try:
            # Instantiate only trusted registry classes with literal kwargs. This
            # invokes GX configuration validators, never supplied Python or data.
            impl(**kwargs)
        except Exception:
            return [failure('INVALID_INVOCATION', 'Arguments violate GX configuration constraints')]
        return []


@lru_cache(maxsize=1)
def installed_registry():
    return ExpectationRegistry()
