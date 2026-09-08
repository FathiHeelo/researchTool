from dataclasses import dataclass, field
from typing import Callable

from app.evaluation.parser import Expression, ParsedCall


@dataclass
class RuleRegistry:
    # Binding knowledge only, not an existence/execution registry.
    signatures: dict[str, tuple[str, ...]] = field(default_factory=lambda: {
        'expect_column_to_exist': ('column',),
        'expect_column_values_to_be_of_type': ('column', 'type_'),
        'expect_column_values_to_be_between': ('column', 'min_value', 'max_value', 'strict_min', 'strict_max'),
        'expect_column_value_lengths_to_be_between': ('column', 'min_value', 'max_value'),
        'expect_column_values_to_be_greater_than': ('column', 'value'),
    })
    transforms: list[Callable] = field(default_factory=list)


def freeze(value, numeric=False):
    if isinstance(value, Expression): return ('expression', value.ast_dump)
    if isinstance(value, dict): return ('dict', tuple(sorted((key, freeze(item, numeric)) for key, item in value.items())))
    if isinstance(value, (list, tuple)): return (type(value).__name__, tuple(freeze(item, numeric) for item in value))
    if numeric and type(value) in (int, float): return ('number', value)
    return (type(value).__name__, value)


def initial_semantics(name, kwargs):
    leaf = name.split('.')[-1]
    prefix = name[:-len(leaf)]
    if leaf == 'expect_column_values_to_be_of_type' and isinstance(kwargs.get('type_'), str):
        kwargs['type_'] = {'text': 'str', 'integer': 'int'}.get(kwargs['type_'], kwargs['type_'])
    if leaf == 'expect_column_values_to_be_greater_than' and 'value' in kwargs and not any(key in kwargs for key in ('min_value', 'max_value', 'strict_min', 'strict_max')):
        kwargs['min_value'] = kwargs.pop('value')
        kwargs['strict_min'] = True
        leaf = 'expect_column_values_to_be_between'
        name = prefix + leaf
    if leaf in {'expect_column_values_to_be_between', 'expect_column_value_lengths_to_be_between'}:
        for key in ('min_value', 'max_value'):
            if kwargs.get(key, object()) is None: kwargs.pop(key)
        if leaf == 'expect_column_value_lengths_to_be_between' and type(kwargs.get('min_value')) in (int, float) and kwargs['min_value'] == 0 and not kwargs.get('strict_min', False):
            kwargs.pop('min_value')
        if leaf == 'expect_column_values_to_be_between':
            for key in ('strict_min', 'strict_max'):
                if kwargs.get(key) is False: kwargs.pop(key)
    return name, kwargs


def default_registry():
    return RuleRegistry(transforms=[initial_semantics])


def canonicalize(call: ParsedCall, registry=None, semantic=True):
    registry = registry or default_registry()
    name, args, kwargs = call.function, list(call.args), dict(call.kwargs)
    signature = registry.signatures.get(name.split('.')[-1])
    if signature and len(args) <= len(signature) and not any(key in kwargs for key in signature[:len(args)]):
        kwargs.update(zip(signature, args))
        args = []
    if semantic:
        for transform in registry.transforms:
            name, kwargs = transform(name, kwargs)
    numeric_keys = {'min_value', 'max_value', 'value'} if semantic and name.split('.')[-1] in {
        'expect_column_values_to_be_between', 'expect_column_value_lengths_to_be_between', 'expect_column_values_to_be_greater_than'} else set()
    return (name, tuple(freeze(arg) for arg in args), tuple(sorted((key, freeze(item, key in numeric_keys)) for key, item in kwargs.items())))
