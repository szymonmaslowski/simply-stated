import ts from 'typescript';
import type { MachineGraph, StateNode, Transition } from './types';

const MACHINE_TREE_TAG = 'MachineTree';
const CROSS_STATE_KEY = '*';

// Unique-symbol properties (the `Tagged` brand) carry an escaped name; the
// public symbol name is not reachable through the checker's string API.
const TAG_PROPERTY_PREFIX = '__@tag';

const unionParts = (type: ts.Type) => (type.isUnion() ? type.types : [type]);

const machineTreeType = (
  checker: ts.TypeChecker,
  machineType: ts.Type,
  node: ts.Node,
) => {
  const tagSymbol = machineType
    .getProperties()
    .find(symbol => symbol.getName().startsWith(TAG_PROPERTY_PREFIX));
  if (!tagSymbol) return undefined;

  const treeSymbol = checker
    .getTypeOfSymbolAtLocation(tagSymbol, node)
    .getProperty(MACHINE_TREE_TAG);
  if (!treeSymbol) return undefined;

  return checker.getTypeOfSymbolAtLocation(treeSymbol, node);
};

const targetStateNames = (
  checker: ts.TypeChecker,
  returnType: ts.Type,
  node: ts.Node,
) =>
  unionParts(returnType).map(part => {
    const nameSymbol = part.getProperty('name');
    if (!nameSymbol) return checker.typeToString(part);

    const nameType = checker.getTypeOfSymbolAtLocation(nameSymbol, node);
    return nameType.isStringLiteral()
      ? nameType.value
      : checker.typeToString(nameType);
  });

const readTransition = (
  checker: ts.TypeChecker,
  eventSymbol: ts.Symbol,
  stateName: string,
  node: ts.Node,
): Transition | undefined => {
  const [signature] = checker
    .getTypeOfSymbolAtLocation(eventSymbol, node)
    .getCallSignatures();
  if (!signature) return undefined;

  const payloadSymbol =
    signature.getParameters()[stateName === CROSS_STATE_KEY ? 0 : 1];

  return {
    event: eventSymbol.getName(),
    payload: payloadSymbol
      ? checker.typeToString(
          checker.getTypeOfSymbolAtLocation(payloadSymbol, node),
        )
      : null,
    targets: targetStateNames(checker, signature.getReturnType(), node),
  };
};

const readStates = (
  checker: ts.TypeChecker,
  treeType: ts.Type,
  node: ts.Node,
): StateNode[] =>
  treeType.getProperties().map(stateSymbol => {
    const stateName = stateSymbol.getName();
    const transitions = checker
      .getTypeOfSymbolAtLocation(stateSymbol, node)
      .getProperties()
      .flatMap(eventSymbol => {
        const transition = readTransition(
          checker,
          eventSymbol,
          stateName,
          node,
        );
        return transition ? [transition] : [];
      });

    return { name: stateName, transitions };
  });

export const extractMachines = (program: ts.Program): MachineGraph[] => {
  const checker = program.getTypeChecker();
  const graphs: MachineGraph[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes('node_modules')) continue;

    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;

        const treeType = machineTreeType(
          checker,
          checker.getTypeAtLocation(declaration.name),
          declaration,
        );
        if (!treeType) continue;

        graphs.push({
          name: declaration.name.text,
          sourceFile: sourceFile.fileName,
          states: readStates(checker, treeType, declaration),
        });
      }
    }
  }

  return graphs;
};
